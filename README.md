# dumpster

Interactive MySQL dump & clone CLI. Full-screen TUI. Docker-aware.

```
██████╗ ██╗   ██╗███╗   ███╗██████╗ ███████╗████████╗███████╗██████╗
██╔══██╗██║   ██║████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
██║  ██║██║   ██║██╔████╔██║██████╔╝███████╗   ██║   █████╗  ██████╔╝
██║  ██║██║   ██║██║╚██╔╝██║██╔═══╝ ╚════██║   ██║   ██╔══╝  ██╔══██╗
██████╔╝╚██████╔╝██║ ╚═╝ ██║██║     ███████║   ██║   ███████╗██║  ██║
╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
```

## What it does

- **Dump** a remote MySQL database to a `.sql` file, with live progress.
- **Clone** a remote database straight into your local MySQL (streams `mysqldump` → `mysql`; no intermediate file).
- Manage saved **remote sources** (encrypted passwords, host/port/user).
- Works whether MySQL runs on the host or **inside a Docker container** (`docker exec` mode).

## Install

```bash
npm i -g dumpster-cli
```

Requires Node ≥ 18, plus one of:
- MySQL client tools (`mysqldump` + `mysql`) on `PATH`, or
- `docker` on `PATH` (if MySQL runs in a container).

## Usage

```bash
dumpster
```

Interactive full-screen TUI. Menu:

- **Dump to local database (clone)** — pick source server + database, then local target.
- **Dump to a .sql file** — pick source + database, output path with **Tab autocomplete**.
- **Manage remote sources** — add / edit / remove saved MySQL servers.
- **Credits**.

Navigation: `↑↓` move · `enter` select · `esc` back · `ctrl+c` quit.

## Docker mode

When adding a server, the last field is **"Docker container (optional)"**.

- Leave **empty** → host MySQL. Uses `mysqldump`/`mysql` binaries on `PATH`.
- Enter a container name/id (e.g. `mysql-1`) → all MySQL calls wrapped as `docker exec -i <container> mysqldump|mysql …`. No port mapping required.

Same option is available on the local-target form, so "dump to local" also works if your local MySQL runs in Docker.

## Path autocomplete

In the `.sql` output path prompt:

- `Tab` — completes the trailing basename. Single match completes fully (adds `/` if it's a directory); multiple matches complete to longest common prefix and list up to 10 candidates below.
- `Ctrl+U` — clear whole path.
- `~` expands to home directory.

## Config

Stored under `~/.config/dumpster/config.json` (Linux/macOS) or the platform-equivalent. Passwords are encrypted at rest with a key kept alongside the config directory (permissions `0600`).

## Development

```bash
git clone <this-repo>
cd dumpster-cli
npm install
npm run dev        # ts-node, live source
npm run build      # emit to dist/
```

## Credits

Built by [Gnanesh Nani](https://github.com/Gnanesh-Nani).

## License

MIT.
