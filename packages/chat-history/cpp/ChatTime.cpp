#include "ChatTime.hpp"

#include <cstdint>

namespace margelo::nitro::legendapps::chathistory {

namespace {

int fixedDigits(std::string_view value, size_t start, size_t count) {
  int result = -1;
  if (start + count <= value.size()) {
    int parsed = 0;
    bool valid = true;
    for (size_t index = start; index < start + count; index += 1) {
      const char digit = value[index];
      valid = valid && digit >= '0' && digit <= '9';
      parsed = parsed * 10 + (valid ? digit - '0' : 0);
    }
    if (valid) {
      result = parsed;
    }
  }
  return result;
}

bool isLeapYear(int year) {
  return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

int daysInMonth(int year, int month) {
  constexpr int days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  int result = 0;
  if (month >= 1 && month <= 12) {
    result = days[month - 1] + (month == 2 && isLeapYear(year) ? 1 : 0);
  }
  return result;
}

int64_t daysFromCivil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
  const unsigned adjustedMonth = month > 2 ? month - 3 : month + 9;
  const unsigned dayOfYear = (153 * adjustedMonth + 2) / 5 + day - 1;
  const unsigned dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(dayOfEra) - 719468;
}

} // namespace

double parseIsoTimestampMilliseconds(std::string_view value) {
  double milliseconds = 0;
  const int year = fixedDigits(value, 0, 4);
  const int month = fixedDigits(value, 5, 2);
  const int day = fixedDigits(value, 8, 2);
  const int hour = fixedDigits(value, 11, 2);
  const int minute = fixedDigits(value, 14, 2);
  const int second = fixedDigits(value, 17, 2);
  const bool valid = value.size() >= 19
      && value[4] == '-'
      && value[7] == '-'
      && value[10] == 'T'
      && value[13] == ':'
      && value[16] == ':'
      && year >= 0
      && month >= 1
      && month <= 12
      && day >= 1
      && day <= daysInMonth(year, month)
      && hour >= 0
      && hour <= 23
      && minute >= 0
      && minute <= 59
      && second >= 0
      && second <= 60;
  if (valid) {
    const int64_t seconds = daysFromCivil(year, static_cast<unsigned>(month), static_cast<unsigned>(day)) * 86400
        + hour * 3600
        + minute * 60
        + second;
    milliseconds = static_cast<double>(seconds) * 1000;
    const size_t dot = value.find('.', 19);
    if (dot != std::string_view::npos) {
      size_t cursor = dot + 1;
      double scale = 100;
      while (cursor < value.size() && scale >= 1 && value[cursor] >= '0' && value[cursor] <= '9') {
        milliseconds += static_cast<double>(value[cursor] - '0') * scale;
        scale /= 10;
        cursor += 1;
      }
    }
  }
  return milliseconds;
}

} // namespace margelo::nitro::legendapps::chathistory
