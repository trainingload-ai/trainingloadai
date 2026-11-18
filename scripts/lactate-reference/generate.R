# Run the original, unmodified base-R method functions from the pinned source.
# No lactater dependencies or replacement method implementations are loaded.
reference <- Sys.getenv("LACTATER_SOURCE", "/reference")
for (file in c("fit.R", "breakpoints.R", "retrieve-values.R", "method-obla.R", "method-bsln-plus.R", "method-loglog.R", "method-dmax.R")) {
  source(file.path(reference, "R", file))
}

case <- function(id, sport, intensity, lactate, heart_rate = NULL) {
  data <- data.frame(intensity = intensity, lactate = lactate)
  if (!is.null(heart_rate)) data$heart_rate <- heart_rate
  settings <- list(fit = "3rd degree polynomial", fixed = c(2, 4), baseline_plus = c(0.5, 1),
                   loglog_restrainer = 1, moddmax_rise = 0.4, dmax_anchor = "original",
                   dmax_methods = c("Dmax", "ModDmax", if (sum(intensity > 0) >= 5) "Log-Poly-ModDmax"))
  curve <- fit_curve(data[data$intensity > 0, ])
  results <- rbind(method_obla(data, curve, settings)$rows,
                   method_bsln_plus(data, curve, settings)$rows,
                   if (sum(intensity > 0) >= 5) method_loglog(data, curve, settings)$rows,
                   method_dmax(data, curve, settings)$rows)
  names <- c("OBLA 2.0" = "obla_2", "OBLA 4.0" = "obla_4", "Bsln + 0.5" = "bsln_05",
             "Bsln + 1.0" = "bsln_10", "Log-log" = "log_log", "Dmax" = "dmax",
             "ModDmax" = "moddmax", "Log-Poly-ModDmax" = "log_poly_moddmax")
  expected <- as.list(stats::setNames(rep(NA_real_, length(names)), unname(names)))
  for (i in seq_len(nrow(results))) expected[[names[[results$method[i]]]]] <- results$intensity[i]
  rows <- lapply(seq_len(nrow(data)), function(i) {
    row <- list(intensity = data$intensity[i], lactate = data$lactate[i])
    if (!is.null(heart_rate)) row$heartRate <- data$heart_rate[i]
    row
  })
  list(id = id, input = list(sport = sport, stages = rows), expectedIntensity = expected)
}

fixtures <- list(
  case("cycling-rest", "cycling", c(0,75,100,125,150,175,200,225,250), c(.9,1,1.1,1.3,1.7,2.4,3.5,5.2,7.5), seq(90,178,11)),
  case("running-rest", "running", c(0,8,10,12,14,16,18), c(1,1.1,1.2,1.6,2.6,4.6,8), seq(90,156,11)),
  case("early-dip", "cycling", c(0,100,125,150,175,200,225,250), c(1.4,1.6,1.2,1,1.5,2.4,4,7.5)),
  case("exact-point-four", "cycling", c(100,125,150,175,200,225), c(1,1.1,1.5,2,3.2,5)),
  case("four-stages", "cycling", c(100,150,200,250), c(1,1.4,2.5,6)),
  case("submaximal", "cycling", c(100,125,150,175,200,225), c(1,.95,1.05,1.2,1.4,1.8))
)

# A small serializer keeps the reference container limited to base R.
json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    values <- vapply(x, json, character(1))
    if (!is.null(names(x))) return(paste0("{", paste(paste0('"', names(x), '":', values), collapse = ","), "}"))
    return(paste0("[", paste(values, collapse = ","), "]"))
  }
  if (is.character(x)) return(paste0('"', x, '"'))
  if (is.na(x) || !is.finite(x)) return("null")
  format(x, digits = 17, scientific = FALSE, trim = TRUE)
}
cat(json(list(referenceCommit = "2cd3709f6442447b3b9128e325f13fa38570eb17", rVersion = as.character(getRversion()), cases = fixtures)), "\n")
