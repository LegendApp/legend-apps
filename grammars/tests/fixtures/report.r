# Presentation timing
durations <- c(30, 45, 60)
average <- function(values) {
  mean(values, na.rm = TRUE)
}
print(average(durations))
