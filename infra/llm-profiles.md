# Local Ollama setup

AI review is optional and disabled until enabled in **Settings**. It uses the
local holdings snapshot to explain concentration, freshness, and data quality.
The backend only accepts local/private Ollama endpoint names and sends no data
to hosted model providers.

## Native Ollama

Install Ollama for your operating system, start the Ollama service, and pull a
model that fits available memory:

```sh
ollama pull gemma4:e2b
# or, for more capable hardware:
ollama pull gemma4:e4b
ollama pull gemma4:26b-a4b
```

In app Settings choose `http://127.0.0.1:11434`, click **Find installed
models**, select the installed tag, enable AI review, and save. The 26B A4B
tag is a mixture-of-experts model and still has substantial memory needs. The
E2B/E4B variants are lighter presets; actual requirements depend on the Ollama
quantization and operating system.

## Docker Compose Ollama

Start the optional service:

```sh
make dev-ai
```

Choose `http://ollama:11434` in app Settings. The service stores model files
under `backend/data/ollama`. Pull the selected model in a separate terminal:

```sh
docker compose exec ollama ollama pull gemma4:e2b
```

If the API runs in Docker while Ollama runs natively on the host, use
`http://host.docker.internal:11434`. For native API development, use
`http://127.0.0.1:11434`. These presets are also available as editable dropdown
suggestions in Settings.

The review is informational, does not forecast returns, and does not issue
security-specific buy/sell/trade recommendations. Model output may be wrong;
check any observation against the cited portfolio evidence.
