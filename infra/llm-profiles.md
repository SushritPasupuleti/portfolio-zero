# Local model profiles

## Apple silicon: MLX

Run an MLX-LM server natively on macOS (recommended for Apple silicon unified memory). Keep the backend containerized and point it to the host MLX server:

```sh
uv run --with mlx-lm python -m mlx_lm.server --model mlx-community/gemma-3-4b-it-qat-4bit
```

Set `LLM_BASE_URL=http://host.docker.internal:8080/v1` and `LLM_MODEL=mlx-community/gemma-3-4b-it-qat-4bit` (confirm model support and RAM fit before downloading).

## 8 GB laptop: Ollama

Use a smaller quantized Gemma 3 1B or 4B model, starting with 1B for responsiveness and memory headroom:

```sh
ollama pull gemma3:1b
ollama serve
```

Set `LLM_BASE_URL=http://host.docker.internal:11434` and `LLM_MODEL=gemma3:1b`. Close other memory-heavy apps; an 8 GB system may struggle with larger models and the full web stack simultaneously.

Inference must remain local. No brokerage data is sent to hosted model providers. The model endpoint is configured explicitly and never selected from user-supplied portfolio text.
