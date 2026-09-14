#pragma once
#include <list>
#include <unordered_map>

namespace margelo::nitro::legendapps::syntaxparser {
// Worker-owned. Weight bounds retained source bytes, not exact native heap use.
// Entry and weight limits apply together; oversized values remain caller-owned.
template<class Key, class Value>
class WeightedLruCache {
  struct Entry { Value value; size_t weight; typename std::list<Key>::iterator position; };
  std::list<Key> order_;
  std::unordered_map<Key, Entry> entries_;
  size_t countLimit_, weightLimit_, weight_ = 0;
public:
  WeightedLruCache(size_t count, size_t weight) : countLimit_(count), weightLimit_(weight) {}
  WeightedLruCache(const WeightedLruCache&) = delete;
  WeightedLruCache& operator=(const WeightedLruCache&) = delete;
  // Optionally hand the last evicted value back to the caller for resource
  // recycling. The caller must reset it before associating it with a new key.
  Value* acquire(const Key& key, size_t weight, Value* evicted = nullptr) {
    auto found = entries_.find(key);
    if (!countLimit_ || weight > weightLimit_) {
      if (found != entries_.end()) {
        weight_ -= found->second.weight; order_.erase(found->second.position); entries_.erase(found);
      }
      return nullptr;
    }
    if (found == entries_.end()) {
      order_.push_back(key);
      try { found = entries_.try_emplace(key, Entry{{}, 0, std::prev(order_.end())}).first; }
      catch (...) { order_.pop_back(); throw; }
    } else order_.splice(order_.end(), order_, found->second.position);
    weight_ -= found->second.weight;
    weight_ += weight; found->second.weight = weight;
    // The requested entry is newest and fits by itself, so eviction never removes it.
    while (entries_.size() > countLimit_ || weight_ > weightLimit_) {
      const auto oldest = entries_.find(order_.front());
      if (evicted) *evicted = std::move(oldest->second.value);
      weight_ -= oldest->second.weight; entries_.erase(oldest); order_.pop_front();
    }
    return &found->second.value;
  }
  void clear() { entries_.clear(); order_.clear(); weight_ = 0; }
  size_t size() const { return entries_.size(); }
  size_t weight() const { return weight_; }
  template<class Visitor> void forEach(Visitor&& visitor) const {
    for (const auto& [key, entry] : entries_) visitor(entry.value);
  }
};
}
