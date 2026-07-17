import type { BlinkBackend } from "../config/models.js";
import { ILogger } from "../common/logging.js";
import type { ManagedClient } from "./types.js";
import { LocalLlamaCompletionClient } from "./llamacpp/localLlamaClient.js";
import { loadRealLlamaEngine } from "./llamacpp/realLlamaEngine.js";
import { OpenAICompletionClient } from "./openai/openAiClient.js";
import { token } from "../di/container.js";

export interface IBackendRegistry {
  create(backend: BlinkBackend): ManagedClient;
}

// Merges with the interface above: one name serves as both type and token.
export const IBackendRegistry = token<IBackendRegistry>("backendRegistry");

/**
 * Maps a backend id to a fresh client. The single place that knows which client
 * class serves which backend — no switch anywhere else. Unregistered backends
 * (ollama) throw "not implemented". The factory closures keep each client's own
 * constructor shape (llamacpp gets the real engine loader + logger; the loader
 * stays a separate ctor arg so unit tests can fake it).
 */
export class BackendRegistry implements IBackendRegistry {
  constructor(@ILogger private readonly logger: ILogger) {}

  private readonly backends: Partial<Record<BlinkBackend, () => ManagedClient>> = {
    llamacpp: () => new LocalLlamaCompletionClient(loadRealLlamaEngine, this.logger),
    openai: () => new OpenAICompletionClient(fetch, this.logger),
  };

  create(backend: BlinkBackend): ManagedClient {
    const make = this.backends[backend];
    if (!make) {
      throw new Error(`blink: the ${backend} backend is not implemented yet`);
    }
    return make();
  }
}
