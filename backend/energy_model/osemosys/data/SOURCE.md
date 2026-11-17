# Vendored OSeMOSYS Israel model

- Source: https://github.com/shahardo/osemosys_israel
- Commit: `bde4210e5a0fb9807565ef754b9d90017fd1efc1`
- Files: `israel_energy_model.yaml` (the tz-osemosys model), `gen_osemosys_files.py` (its generator),
  `reference.json` (the total discounted cost in the repo's `results/`, used by the tests).

Do not edit these files here: change the model in osemosys_israel and re-run `python scripts/sync_osemosys.py`.
Our additions (sectors and sources the dashboard has and the model lacked) are in `../additions.yaml`.
