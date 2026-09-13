#include "../cpp/WeightedLruCache.hpp"
#include <cassert>
#include <iostream>
#include <memory>
using namespace margelo::nitro::legendapps::syntaxparser;
int main() {
  WeightedLruCache<int, std::unique_ptr<int>> cache(2, 10);
  *cache.acquire(1, 3) = std::make_unique<int>(11);
  *cache.acquire(2, 3) = std::make_unique<int>(22);
  assert(**cache.acquire(1, 4) == 11); // Reweight preserves value and promotes MRU.
  *cache.acquire(3, 4) = std::make_unique<int>(33); // Evicts 2, not 1.
  assert(**cache.acquire(1, 4) == 11);
  assert(cache.weight() == 8 && cache.size() == 2);
  assert(!*cache.acquire(2, 1));
  assert(cache.weight() == 5);
  assert(cache.acquire(1, 11) == nullptr); // Oversized edit releases prior entry.
  assert(cache.size() == 1 && cache.weight() == 1);
  assert(cache.acquire(9, 100) == nullptr);
  cache.clear(); assert(cache.size() == 0 && cache.weight() == 0);
  WeightedLruCache<int, int> byWeight(100, 3);
  *byWeight.acquire(1, 2) = 1; *byWeight.acquire(2, 2) = 2;
  assert(byWeight.size() == 1 && byWeight.weight() == 2);
  WeightedLruCache<int, int> disabled(0, 10);
  assert(disabled.acquire(1, 1) == nullptr);
  for (int i = 0; i < 10000; ++i) { cache.acquire(i, i % 12); assert(cache.size() <= 2 && cache.weight() <= 10); }
  std::cout << "Weighted LRU: recency, reweighting, oversized values, count/weight bounds and clear passed\n";
}
