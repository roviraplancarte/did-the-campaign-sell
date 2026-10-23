# Did the campaign sell?

A step-by-step incrementality analysis on a **simulated** store chain, written from scratch. Because the data is
simulated, the true effect of the campaign is known, so every estimate can be checked against it.

## Steps
1. **Setup:** 160 stores in 16 cities of a fictional region; 12 weeks before and 4 weeks of campaign. The campaign
   runs in 8 cities picked at random and the other 8 are the control group (a geo experiment). The true effect is
   small almost everywhere and large in two areas.
2. **Lift per store:** sales during the campaign against the 12 weeks before, minus the typical change in control
   stores.
3. **Is it real?** Wilcoxon signed-rank (campaign lift above zero) and Mann-Whitney (campaign against control).
4. **Where did it come from?** K-means on lift and store size; share of the effect by segment.
5. **Does it cluster?** Global Moran's I and local LISA with 6-nearest-neighbor weights and 999 permutations.
6. **How much?** A Causal Impact-style counterfactual: regression of campaign-city sales on control-city sales
   before the campaign, projected over the campaign, with a residual-bootstrap interval.

With the default seed the estimate is **+3.3% (105k units, 95% interval 88k to 123k)** against a true **+3.0%
(98k units)**.

## Run it
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analisis.py         # writes web/resultado.json
cd web && python3 -m http.server     # open http://localhost:8000
```
All data is synthetic (seed 20260412). It does not describe any real company, campaign or store.

## About `web/`
`web/` is the page as it appears on the author's personal site. Opened on its own it works the same, but it falls back
to system fonts and its menu links point to the rest of that site.

## License
Code: MIT (see `LICENSE`). All data is simulated.
