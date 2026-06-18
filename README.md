# Pi Web UI

A web interface for [pi](https://github.com/earendil-works/pi).

## Usage

```
PI_WEBUI=1 pi --extension git:git@github.com:furkan-bilgin/pi-web-ui.git
```

Open `http://127.0.0.1:4096` in your browser. Set `PI_WEBUI_LISTEN=:5000` to change the port.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PI_WEBUI_HOST` | 127.0.0.1 | HTTP bind host |
| `PI_WEBUI_PORT` | 4096 | HTTP bind port |
| `PI_PROJECT_CWD` | cwd | Project directory for sessions |
| `PI_WEBUI_TOOLS` | - | Comma-separated tool allowlist |
| `PI_WEBUI_EXCLUDE_TOOLS` | - | Comma-separated tool denylist |
| `PI_WEBUI_NO_TOOLS` | - | Set to 1 to disable all tools |
| `PI_WEBUI_ALLOW_ALL_COMMANDS` | - | Set to 1 to enable all slash commands |
| `PI_WEBUI_LISTEN` | - | Server listen address for auto-start |
