#pragma once

#include "../nitrogen/generated/shared/c++/HybridCodexAppServerSpec.hpp"

namespace margelo::nitro::legendapps::codex {

class HybridCodexAppServer final : public HybridCodexAppServerSpec {
public:
  HybridCodexAppServer();

  std::shared_ptr<Promise<CodexAvailability>> getAvailability() override;
  std::shared_ptr<Promise<CodexRunResult>> runPrompt(
      const std::string& prompt,
      const std::string& cwd,
      const std::string& reasoningEffort,
      double timeoutMs,
      const std::string& outputSchemaJson,
      const std::string& developerInstructions) override;
  double cancelActiveRuns() override;
  double shutdown() override;
};

} // namespace margelo::nitro::legendapps::codex
