# Hosting on a Hugging Face Space (free)

The whole app (the dashboard, the Python API and the OSeMOSYS solver) runs as one **Docker Space** on the free
"CPU basic" hardware: 2 vCPU, 16 GB RAM. A full OSeMOSYS solve takes about 20 s and under 0.5 GB there.

Free-tier behaviour to know about:

- The Space **sleeps** after a period without visitors; the first visit after that waits for it to start (1–2 min).
- Its **disk is wiped** on every restart. Saved scenarios and run results survive because the app mirrors its state
  folder to a **private dataset** (step 2): restored on start, pushed every 5 minutes when something changed, right
  after each finished run, and on shutdown. A run that was still going during a restart is marked failed; run it again.
- The Space is **public** unless you make it private (step 4).

## 1. Create the Space

On huggingface.co: **New → Space**, any name (e.g. `energy-dashboard`), **SDK: Docker**, template **Blank**,
hardware **CPU basic (free)**. Leave it empty; the deploy uploads everything.

## 2. Create the state dataset

**New → Dataset**, e.g. `energy-dashboard-data`, **Private**. (If it doesn't exist the app creates it, but then the
token in step 3 needs permission to create repositories.)

## 3. Tokens

Under **Settings → Access Tokens**, create two **fine-grained** tokens:

| Token | Permission | Goes to |
|---|---|---|
| state token | write access to the dataset from step 2 only | the Space's secret `HF_TOKEN` |
| deploy token | write access to the Space from step 1 only | the GitHub repo secret `HF_TOKEN` |

## 4. Space settings (Settings → Variables and secrets)

| Name | Kind | Value |
|---|---|---|
| `HF_TOKEN` | secret | the state token |
| `STATE_REPO` | variable | `<user>/energy-dashboard-data` |
| `RUN_TOKEN` | secret, optional | any passphrase: then starting a solve and saving / deleting on the server need it (entered once in the ⚙ dialog or the optimisation tab, kept in that browser). Viewing stays open. |
| `MAX_ACTIVE_RUNS` | variable, optional | parallel solves (default 1; the free hardware has 2 vCPU) |
| `RUN_TIME_LIMIT` | variable, optional | seconds per solve (default 1800) |
| `SYNC_EVERY` | variable, optional | seconds between state pushes (default 300) |

To restrict who can open the app at all, set the Space to **Private** (Settings → Change visibility): only you and
members you add can open it, after signing in to Hugging Face.

## 5. GitHub settings (repo → Settings → Secrets and variables → Actions)

| Name | Kind | Value |
|---|---|---|
| `HF_TOKEN` | secret | the deploy token |
| `HF_SPACE` | variable | `<user>/energy-dashboard` |

From then on every push to `main` that passes CI deploys (`.github/workflows/deploy-hf-space.yml`); you can also run
that workflow by hand (Actions → Deploy to Hugging Face Space → Run workflow). Without `HF_SPACE` the workflow skips.

To deploy from your own machine instead: `HF_TOKEN=<deploy token> python scripts/deploy_hf_space.py --space <user>/energy-dashboard`.

## 6. Check

Open `https://huggingface.co/spaces/<user>/energy-dashboard`. The app should show the tab **"אופטימיזציה (OSeMOSYS)"**
(it only appears when the API answers). `…hf.space/api/health` should report `"stateMirror": true`.

## Using the Space's API from the GitHub Pages copy (optional)

The Pages build is static and runs offline. To give it the server features too, build it with
`VITE_API_URL=https://<user>-energy-dashboard.hf.space` and add the Pages origin to the Space's `CORS_ORIGINS`
variable (`https://<user>.github.io` is allowed by default). A private Space can't be called this way.
