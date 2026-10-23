"""¿La campaña vendió? Incrementalidad paso a paso sobre una cadena de tiendas SIMULADA (todo sintético, escrito desde cero).

Como los datos son simulados, conocemos el efecto real de la campaña y podemos comparar cada estimación contra la verdad.

1. Simulación: 160 tiendas en 16 ciudades de una región ficticia. 84 días antes y 28 días de campaña. La campaña corre
   en 8 ciudades elegidas al azar (las otras 8 son el grupo de control, como en un experimento geográfico). El efecto
   real es pequeño en casi todas partes y grande en dos zonas.
2. Lift por tienda: cambio de ventas después contra antes, descontando el cambio típico del grupo de control.
3. Wilcoxon de rangos con signo (¿el lift de las tiendas con campaña es distinto de cero?) y Mann-Whitney (¿difiere del
   control?): pruebas no paramétricas porque el lift por tienda no es normal.
4. K-means sobre lift y tamaño de tienda: qué grupo de tiendas explica la mayor parte del efecto.
5. Moran's I global y LISA (local) con pesos de 6 vecinos y permutaciones: si el efecto se agrupa en el espacio.
6. Contrafactual estilo Causal Impact: regresión de las ventas diarias con campaña sobre las del control en el periodo
   previo, proyectada al periodo de campaña; intervalo por bootstrap de residuales.

Uso: .venv/bin/python analisis.py   ->   web/resultado.json
"""
import json
from pathlib import Path

import numpy as np
from scipy import stats
from sklearn.cluster import KMeans

DIR = Path(__file__).resolve().parent
rng = np.random.default_rng(20260412)

N_CIUDADES, POR_CIUDAD = 16, 10
PRE, POST = 84, 28
DIAS = PRE + POST
PERMUTACIONES = 999


# 1. Simulación ---------------------------------------------------------------------------------------------------
def simular():
    centros = rng.uniform([5, 5], [95, 75], size=(N_CIUDADES, 2))           # km en una región de 100 x 80
    ciudad = np.repeat(np.arange(N_CIUDADES), POR_CIUDAD)
    xy = centros[ciudad] + rng.normal(0, 3.0, size=(len(ciudad), 2))
    campana_ciudades = rng.choice(N_CIUDADES, N_CIUDADES // 2, replace=False)
    tratada = np.isin(ciudad, campana_ciudades)

    base = rng.lognormal(np.log(1200), 0.45, size=len(ciudad))             # ventas diarias típicas por tienda
    dia = np.arange(DIAS)
    semana = 1 + 0.12 * np.sin(2 * np.pi * (dia % 7) / 7) + 0.06 * (dia % 7 >= 5)
    tendencia = 1 + 0.0008 * dia + 0.03 * np.sin(2 * np.pi * dia / 60)       # común a toda la cadena
    ruido_ciudad = rng.normal(0, 0.025, size=(N_CIUDADES, DIAS))

    def bump(p, c, r, h):
        return h * np.exp(-((p - c) ** 2).sum(axis=1) / (2 * r ** 2))
    efecto = 0.015 + bump(xy, np.array([25, 55]), 10, 0.14) + bump(xy, np.array([70, 25]), 9, 0.11)
    efecto = np.clip(efecto + rng.normal(0, 0.012, size=len(ciudad)), 0, None) * tratada

    ventas = np.empty((len(ciudad), DIAS))
    for i in range(len(ciudad)):
        nivel = base[i] * semana * tendencia * (1 + ruido_ciudad[ciudad[i]]) * (1 + rng.normal(0, 0.05, DIAS))
        nivel[PRE:] *= 1 + efecto[i]
        ventas[i] = nivel
    real = (ventas[:, PRE:] - ventas[:, PRE:] / (1 + efecto[:, None])).sum()   # unidades incrementales verdaderas
    return dict(xy=xy, ciudad=ciudad, tratada=tratada, base=base, efecto=efecto, ventas=ventas, incremental_real=real)


# 2-3. Lift por tienda y pruebas no paramétricas -------------------------------------------------------------------
def lift_por_tienda(s):
    v = s["ventas"]
    razon = v[:, PRE:].mean(axis=1) / v[:, :PRE].mean(axis=1)
    control = np.median(razon[~s["tratada"]])
    return razon / control - 1, razon


def pruebas(lift, razon, tratada):
    w = stats.wilcoxon(lift[tratada], alternative="greater")
    mw = stats.mannwhitneyu(razon[tratada], razon[~tratada], alternative="greater")
    return {"wilcoxon_p": float(w.pvalue), "mannwhitney_p": float(mw.pvalue),
            "lift_mediano_campana": float(np.median(lift[tratada])), "lift_mediano_control": float(np.median(lift[~tratada]))}


# 4. Segmentos con K-means ------------------------------------------------------------------------------------------
def segmentos(s, lift):
    t = s["tratada"]
    X = np.column_stack([lift[t], np.log(s["base"][t])])
    X = (X - X.mean(axis=0)) / X.std(axis=0)
    km = KMeans(n_clusters=3, n_init=20, random_state=7).fit(X)
    etiquetas = km.labels_
    inc = lift[t] * s["ventas"][t, :PRE].mean(axis=1) * POST                 # unidades incrementales estimadas
    orden = np.argsort([-lift[t][etiquetas == k].mean() for k in range(3)])  # 0 = el de mayor lift
    renombre = {int(k): r for r, k in enumerate(orden)}
    seg = np.array([renombre[int(e)] for e in etiquetas])
    total = inc.clip(min=0).sum()
    resumen = [{"segmento": k, "tiendas": int((seg == k).sum()), "lift_medio": float(lift[t][seg == k].mean()),
                "parte_del_efecto": float(inc[seg == k].clip(min=0).sum() / total)} for k in range(3)]
    return seg, resumen


# 5. Moran's I y LISA -----------------------------------------------------------------------------------------------
def pesos_vecinos(xy, k=6):
    d = np.linalg.norm(xy[:, None] - xy[None], axis=2)
    np.fill_diagonal(d, np.inf)
    W = np.zeros_like(d)
    idx = np.argsort(d, axis=1)[:, :k]
    W[np.arange(len(xy))[:, None], idx] = 1.0 / k                            # estandarizada por filas
    return W, idx


def moran(xy, valor):
    W, vecinos = pesos_vecinos(xy)
    z = (valor - valor.mean()) / valor.std()
    lag = W @ z
    I = float(z @ lag / len(z))
    nulos = np.array([z @ (W @ rng.permutation(z)) / len(z) for _ in range(PERMUTACIONES)])
    p_global = float(((nulos >= I).sum() + 1) / (PERMUTACIONES + 1))

    local = z * lag
    clases, p_local = [], []
    for i in range(len(z)):
        otros = np.delete(z, i)
        sim = np.array([z[i] * rng.choice(otros, size=vecinos.shape[1], replace=False).mean() for _ in range(PERMUTACIONES)])
        p = float(((np.abs(sim) >= abs(local[i])).sum() + 1) / (PERMUTACIONES + 1))
        p_local.append(p)
        if p >= 0.05:
            clases.append("ns")
        elif z[i] > 0 and lag[i] > 0:
            clases.append("HH")
        elif z[i] < 0 and lag[i] < 0:
            clases.append("LL")
        else:
            clases.append("HL" if z[i] > 0 else "LH")
    return {"I": I, "p": p_global}, clases, p_local


# 6. Contrafactual estilo Causal Impact ----------------------------------------------------------------------------
def contrafactual(s):
    t = s["tratada"]
    y = s["ventas"][t].sum(axis=0)
    x = s["ventas"][~t].sum(axis=0)
    dia = np.arange(DIAS)
    X = np.column_stack([np.ones(DIAS), x, dia % 7 == 5, dia % 7 == 6])
    beta, *_ = np.linalg.lstsq(X[:PRE], y[:PRE], rcond=None)
    pred = X @ beta
    resid = y[:PRE] - pred[:PRE]
    sims = np.array([(y[PRE:] - (pred[PRE:] + rng.choice(resid, POST))).sum() for _ in range(4000)])
    efecto = float((y[PRE:] - pred[PRE:]).sum())
    return {"real": y.tolist(), "predicho": pred.tolist(), "efecto": efecto,
            "intervalo": [float(np.percentile(sims, 2.5)), float(np.percentile(sims, 97.5))],
            "lift_pct": float(efecto / pred[PRE:].sum()),
            "banda": float(np.percentile(np.abs(resid), 95))}


def main():
    s = simular()
    lift, razon = lift_por_tienda(s)
    t = s["tratada"]
    p = pruebas(lift, razon, t)
    seg, seg_resumen = segmentos(s, lift)
    moran_global, lisa, p_lisa = moran(s["xy"][t], lift[t])
    cf = contrafactual(s)

    real_pct = float(s["incremental_real"] / (s["ventas"][t, PRE:].sum() - s["incremental_real"]))
    tiendas, j = [], 0
    for i in range(len(t)):
        fila = {"x": round(float(s["xy"][i, 0]), 2), "y": round(float(s["xy"][i, 1]), 2), "ciudad": int(s["ciudad"][i]),
                "campana": bool(t[i]), "base": round(float(s["base"][i])), "lift": round(float(lift[i]), 4),
                "efecto_real": round(float(s["efecto"][i]), 4)}
        if t[i]:
            fila.update(segmento=int(seg[j]), lisa=lisa[j], p_lisa=round(p_lisa[j], 3))
            j += 1
        tiendas.append(fila)

    salida = {
        "parametros": {"tiendas": int(len(t)), "ciudades": N_CIUDADES, "dias_antes": PRE, "dias_campana": POST,
                       "tiendas_campana": int(t.sum())},
        "pruebas": p, "segmentos": seg_resumen, "moran": moran_global, "contrafactual": cf,
        "verdad": {"incremental": float(s["incremental_real"]), "lift_pct": real_pct},
        "tiendas": tiendas,
    }
    (DIR / "web").mkdir(exist_ok=True)
    (DIR / "web" / "resultado.json").write_text(json.dumps(salida, ensure_ascii=False))

    print(f"Wilcoxon p={p['wilcoxon_p']:.2g} · Mann-Whitney p={p['mannwhitney_p']:.2g} · "
          f"lift mediano {p['lift_mediano_campana']:.1%} (control {p['lift_mediano_control']:.1%})")
    for r in seg_resumen:
        print(f"  segmento {r['segmento']}: {r['tiendas']} tiendas, lift {r['lift_medio']:.1%}, {r['parte_del_efecto']:.0%} del efecto")
    print(f"Moran's I={moran_global['I']:.2f} (p={moran_global['p']:.3f}) · LISA: " +
          ", ".join(f"{c} {lisa.count(c)}" for c in ("HH", "LL", "HL", "LH", "ns")))
    print(f"Contrafactual: {cf['efecto']:,.0f} unidades [{cf['intervalo'][0]:,.0f}, {cf['intervalo'][1]:,.0f}] = "
          f"{cf['lift_pct']:.1%} · verdad {s['incremental_real']:,.0f} = {real_pct:.1%}")


if __name__ == "__main__":
    main()
