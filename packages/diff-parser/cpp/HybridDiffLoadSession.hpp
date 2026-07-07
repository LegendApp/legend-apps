#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffLoadSessionSpec.hpp"
#include "DiffParserCore.hpp"
#include "HybridDiffDocument.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

namespace margelo::nitro::legenddesktop::diffparser {

class HybridDiffLoadSession final : public HybridDiffLoadSessionSpec {
public:
  static std::shared_ptr<HybridDiffLoadSession> create(
      const std::string& folderPath,
      bool showOnlyHunks,
      DiffGitCompareOptions compareOptions);
  static std::shared_ptr<HybridDiffLoadSession> createUnifiedDiffUrl(
      const std::string& diffUrl,
      const std::string& sourceLabel);
  HybridDiffLoadSession(std::string folderPath, bool showOnlyHunks, DiffGitCompareOptions compareOptions);
  HybridDiffLoadSession(std::string diffUrl, std::string sourceLabel);
  ~HybridDiffLoadSession() override;

  std::shared_ptr<HybridDiffDocumentSpec> getDocument() override;
  DiffLoadProgress consumeChanges(double initialRowCount) override;
  double cancel() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  enum class Kind {
    GitFolder,
    UnifiedDiffUrl,
  };

  void start();
  void run();
  void runGitFolder();
  void runUnifiedDiffUrl();
  void joinWorker();
  void noteRowsAvailable();
  void setError(std::string error);

  Kind kind_;
  std::string folderPath_;
  std::string diffUrl_;
  std::string sourceLabel_;
  bool showOnlyHunks_;
  DiffGitCompareOptions compareOptions_;
  std::shared_ptr<HybridDiffDocument> document_;
  std::thread workerThread_;
  std::atomic<bool> cancelled_{false};
  std::atomic<bool> complete_{false};
  std::atomic<bool> firstFilesLogged_{false};
  std::atomic<bool> firstRowsLogged_{false};
  std::atomic<bool> initialRowsLogged_{false};
  std::atomic<uint64_t> rowVersion_{0};
  std::atomic<uint64_t> fileVersion_{0};
  std::mutex errorMutex_;
  std::string error_;
};

} // namespace margelo::nitro::legenddesktop::diffparser
