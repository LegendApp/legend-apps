#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffLoadSessionSpec.hpp"
#include "HybridDiffDocument.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

namespace margelo::nitro::legenddesktop::diffparser {

class HybridDiffLoadSession final : public HybridDiffLoadSessionSpec {
public:
  static std::shared_ptr<HybridDiffLoadSession> create(const std::string& folderPath, bool showOnlyHunks);
  HybridDiffLoadSession(std::string folderPath, bool showOnlyHunks);
  ~HybridDiffLoadSession() override;

  std::shared_ptr<HybridDiffDocumentSpec> getDocument() override;
  DiffLoadProgress consumeChanges(double initialRowCount) override;
  double cancel() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  void start();
  void run();
  void joinWorker();
  void noteRowsAvailable();
  void setError(std::string error);

  std::string folderPath_;
  bool showOnlyHunks_;
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
