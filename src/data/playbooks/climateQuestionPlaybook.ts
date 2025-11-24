type PlaybookEntry = {
  id: string;
  title: string;
  content: string;
  category?: string;
};

const climateQuestionPlaybook: PlaybookEntry[] = [
  {
    id: "analysis-basic-data",
    title: "Basic Data Retrieval Questions",
    category: "analysis-playbook",
    content: `
Scope: one-off lookups for a coordinate, bounding box, or named region at a specific time.

Representative prompts:
- What was the surface temperature at latitude X, longitude Y on a given date?
- What is the current sea surface temperature in the Pacific Ocean?
- Show precipitation levels in Europe during January 2023.
- What was the air temperature range in North America last summer?
- Which region had the highest surface temperature in a given month?
- What are precipitation values along the equator?
- Compare sea surface temperatures between the Atlantic and Indian Oceans.
- What's the minimum air temperature recorded in Antarctica?

How to respond:
1. Identify the dataset (surface temp, SST, precipitation, etc.) from the current selection or follow-up clarifications.
2. Extract numeric coordinates, named regions, and the requested temporal window. Fall back to the active globe marker if the user says “current location”.
3. Use "point_timeseries", "point_statistics", or "/api/v2/timeseries/extract" (mean aggregation) to fetch values.
4. Present the requested value/range with units, the actual nearest coordinate/time used, and note any interpolation.
5. If the region is large (e.g., “Europe”), compute an aggregate (mean/min/max) over that bounding box and explain the sampling method.`,
  },
  {
    id: "analysis-temporal",
    title: "Temporal Analysis Questions",
    category: "analysis-playbook",
    content: `
Scope: describe how a variable evolves over months, years, or decades, including trends and seasonality.

Representative prompts:
- How has surface temperature changed in the Amazon rainforest over the past decade?
- Show the trend of sea surface temperatures in the Arctic from 2000–2024.
- What seasonal patterns exist in precipitation for Southeast Asia?
- Compare air temperature anomalies between 2015 and 2024.
- When did the highest surface temperature spike occur in Australia?
- How do precipitation levels vary month-to-month in the Sahel?
- What's the rate of temperature increase in polar regions over 20 years?
- Identify periods of drought based on precipitation data.

How to respond:
1. Determine the spatial mask (region or marker) and the period to analyse. Default to dataset coverage if not provided.
2. Request a long-window timeseries via "/api/v2/timeseries/extract" or "/seasonal_timeseries" to obtain monthly/annual records.
3. Compute descriptive statistics (min/max anomalies, slope per decade, standard deviation) in code and summarise in natural language.
4. Mention notable peaks/troughs, dates, and whether changes are statistically significant (based on trend magnitude vs noise).
5. Offer optional visual guidance (e.g., “Use the Time Bar to animate 2010–2020 for a quick visual check”).`,
  },
  {
    id: "analysis-spatial",
    title: "Spatial Analysis Questions",
    category: "analysis-playbook",
    content: `
Scope: comparisons across regions, hemispheres, or gradients at a single time slice.

Representative prompts:
- Which hemisphere shows greater surface temperature variance?
- Where are ocean upwelling zones based on SST?
- Map the precipitation gradient from coastal to inland areas.
- Which latitude bands experience the most extreme air temperatures?
- Identify regions with anomalous temperature patterns.
- Where do precipitation and surface temperature show inverse relationships?
- What are the spatial correlations between datasets?
- Find areas with the steepest temperature gradients.

How to respond:
1. Use the raster metadata (min/max) plus optional "/raster/visualize" previews to describe spatial contrasts.
2. For variance or gradient questions, fetch tiled statistics (e.g., average per hemisphere or per latitude band) by batching API calls or referencing precomputed summaries.
3. Mention the datasets involved, the date/level, and cite any correlation coefficients or qualitative observations (e.g., “upwelling shows up as cold tongues along the equator in eastern basins”).
4. Encourage users to overlay geographic lines/boundaries if they need to inspect the gradient interactively.`,
  },
  {
    id: "analysis-statistical",
    title: "Statistical & Aggregation Questions",
    category: "analysis-playbook",
    content: `
Scope: global/regional averages, quantiles, and variance metrics over defined windows.

Representative prompts:
- What's the global average surface temperature for 2023?
- Calculate mean SST for tropical regions.
- What's the standard deviation of precipitation across continents?
- Show the 95th percentile air temperatures globally.
- What percentage of Earth's surface exceeded 30 °C in July?
- Calculate monthly precipitation totals for South America.
- What's the median surface temperature at mid-latitudes?
- Compare SST variance between hemispheres.

How to respond:
1. Decide whether to use a spatial mask (global, tropical band, continent). Document that mask in the answer.
2. Fetch aggregated stats from "/point_statistics" (for single points) or custom aggregation endpoints when available. For larger areas, explain the sampling strategy (e.g., gridding or dataset metadata).
3. Report the requested metric with units and rounding, plus any assumptions (e.g., “tropical defined as 30°S–30°N”).
4. When percentages are requested, share numerator/denominator logic or note when an approximate estimate is provided.`,
  },
  {
    id: "analysis-anomaly",
    title: "Anomaly Detection Questions",
    category: "analysis-playbook",
    content: `
Scope: highlight departures from climatology—including heat/cold waves, rainfall anomalies, and marine heatwaves.

Representative prompts:
- Identify heat waves based on surface temperature thresholds.
- Detect cold snaps in air temperature data.
- Where are marine heat waves occurring in SST data?
- Find precipitation anomalies compared to historical averages.
- Which regions show unexpected warming trends?
- Identify extreme precipitation events.
- Detect El Niño signals in SST patterns.
- Where are surface temperatures deviating most from climate normals?

How to respond:
1. Determine the baseline (e.g., 30-year mean, last-decade mean) and the anomaly metric (absolute vs standard deviation).
2. Use dataset metadata to note whether anomalies are already provided; if not, describe how to compute them (current minus baseline).
3. For events (heat waves, cold snaps), specify thresholds (e.g., >2σ for three consecutive days) and cite the dates/regions where criteria are met.
4. Always mention uncertainty and encourage cross-checking with multi-dataset views when anomalies are regionally focused.`,
  },
  {
    id: "analysis-comparative",
    title: "Comparative Analysis Questions",
    category: "analysis-playbook",
    content: `
Scope: compare metrics between datasets, regions, or physical domains.

Representative prompts:
- How does surface temperature differ from air temperature in deserts?
- Compare coastal vs inland precipitation patterns.
- What's the relationship between SST and nearby air temperature?
- How do temperature ranges differ between oceanic and continental areas?
- Compare precipitation seasonality between hemispheres.
- Which dataset shows the greatest interannual variability?
- How do mountain regions differ in air vs surface temperature?
- Compare warming rates across ocean basins.

How to respond:
1. Identify both datasets and ensure they share comparable units/timescales. Mention any normalization.
2. Present side-by-side stats (e.g., average, trend, variance) and highlight notable contrasts.
3. If relationships are requested (e.g., SST vs air temperature), discuss correlation direction/magnitude and note known physical drivers (e.g., land-sea contrast).
4. Encourage use of multiple markers or polygons if the user wants to reproduce the comparison on the globe.`,
  },
  {
    id: "analysis-multi-dataset",
    title: "Multi-Dataset Integration Questions",
    category: "analysis-playbook",
    content: `
Scope: explain how different variables (SST, air temperature, precipitation, etc.) interact.

Representative prompts:
- How does SST correlate with coastal precipitation?
- What's the relationship between air and surface temperature over land?
- Do warmer seas lead to increased nearby precipitation?
- How do all four variables interact in monsoon regions?
- Identify regions where datasets show extreme values simultaneously.
- What's the lag between SST changes and precipitation responses?
- How do surface and air temperatures converge/diverge across biomes?
- Predict precipitation patterns based on temperature datasets.

How to respond:
1. Describe the physical linkage (e.g., warmer SST increasing evaporation).
2. Reference relevant datasets and suggest correlation or lag analysis via repeated API calls (e.g., compute correlation coefficient between SST and precipitation at the same lat/lon).
3. For lag questions, explain how to shift one timeseries relative to the other and summarize findings (e.g., “SST changes lead rainfall by ~2 months in the Indian Ocean”).
4. When predicting, clarify that the system provides contextual guidance rather than formal forecasts unless a model is available.`,
  },
  {
    id: "analysis-patterns",
    title: "Climate Pattern Recognition Questions",
    category: "analysis-playbook",
    content: `
Scope: recognise large-scale circulation features and named climate patterns.

Representative prompts:
- Identify ENSO patterns.
- Detect monsoon onset/retreat based on precipitation.
- Where are polar amplification signals visible?
- Identify the Intertropical Convergence Zone (ITCZ) from precipitation.
- Detect atmospheric rivers in precipitation data.
- Where do urban heat islands appear in surface temperature?
- Identify tropical cyclone tracks from combined datasets.
- Detect blocking patterns from temperature anomalies.

How to respond:
1. Combine spatial + temporal context: describe how the pattern manifests on the globe (e.g., warm SST tongue in eastern Pacific for El Niño).
2. Reference the datasets/levels needed (SST for ENSO, precipitation for ITCZ, etc.).
3. Provide diagnostic steps users can replicate (e.g., “Enable geographic lines and step through boreal summer months to see the ITCZ migrate north”).
4. Cite any thresholds or known signatures to help verify the pattern.`,
  },
  {
    id: "analysis-extreme-events",
    title: "Extreme Event Questions",
    category: "analysis-playbook",
    content: `
Scope: pinpoint recent or historical extremes in temperature and precipitation.

Representative prompts:
- What was the most severe heatwave in the past year?
- Identify flood events from extreme precipitation.
- Where did record-breaking temperatures occur?
- Find the coldest period in the last decade.
- Identify droughts lasting more than six months.
- Where have marine heatwaves persisted longest?
- What regions experienced unprecedented precipitation?
- Detect compound events (hot and dry simultaneously).

How to respond:
1. Define the event criteria (threshold + duration) and mention them explicitly.
2. Query the relevant dataset/time window, summarizing start/end dates, peak intensity, and affected regions.
3. For compound extremes, explain how overlapping metrics were combined.
4. Encourage users to inspect the Time Bar or run multiple markers for verification.`,
  },
  {
    id: "analysis-regional",
    title: "Regional-Specific Questions",
    category: "analysis-playbook",
    content: `
Scope: describe climate conditions for named regions (Amazon, Arctic, Sahara, etc.).

Representative prompts:
- What are the climate conditions in the Amazon basin?
- How is the Arctic changing across datasets?
- Describe Mediterranean climate patterns.
- What's happening in the Sahara?
- Analyse the Himalayas, Great Barrier Reef, Siberian tundra, Congo rainforest, etc.

How to respond:
1. Summarize the dominant climate signals for the region across active datasets (temperature, precipitation, SST).
2. Mention recent trends or anomalies if available.
3. Tie observations to known climate classifications (e.g., “Mediterranean climates show wet winters and dry summers”).
4. Offer actionable steps for deeper exploration (e.g., “Focus the globe on the region and animate the last 20 years”).`,
  },
  {
    id: "analysis-forecasting",
    title: "Predictive / Forecasting Questions",
    category: "analysis-playbook",
    content: `
Scope: infer short-term or long-term outcomes using current trends.

Representative prompts:
- Based on current trends, what will surface temperatures be in 2030?
- Predict next season's precipitation from SST.
- What regions are likely to experience droughts?
- Forecast temperature anomalies for the next quarter.
- Which areas will likely see increased precipitation?
- Predict cooling/warming phases in ocean basins.
- What's the expected temperature range for next summer?
- Forecast extreme weather probabilities by region.

How to respond:
1. Emphasize observational evidence and clearly separate projection from measurement.
2. Use existing trend estimates to extrapolate (linear trend * years) and state assumptions.
3. Highlight uncertainty and recommend consulting dedicated forecast products when needed.
4. If the platform lacks predictive models, explain that responses are qualitative projections grounded in observed trends.`,
  },
  {
    id: "analysis-climate-change",
    title: "Climate Change Assessment Questions",
    category: "analysis-playbook",
    content: `
Scope: quantify long-term changes, accelerations, and shifts in variability.

Representative prompts:
- How much has global surface temperature increased since 2000?
- What's the rate of ocean warming?
- Are precipitation patterns becoming more extreme?
- How are temperature gradients between poles and equator changing?
- What evidence of climate change exists in the datasets?
- How has extreme-event frequency changed?
- Are wet regions getting wetter and dry regions drier?
- What's the acceleration rate of warming?

How to respond:
1. Pull multi-decade timeseries and compute differences/trends for the requested variables.
2. Describe spatial redistribution (e.g., polar amplification) where relevant.
3. Reference specific metrics (per-decade warming, change in variance, change in extremes) and cite the datasets/time windows used.
4. Clarify uncertainties and encourage cross-referencing multiple datasets for robustness.`,
  },
  {
    id: "analysis-data-quality",
    title: "Data Quality & Validation Questions",
    category: "analysis-playbook",
    content: `
Scope: identify gaps, outliers, biases, and coverage issues.

Representative prompts:
- Are there missing data points in the Arctic during winter?
- Identify outliers in the SST dataset.
- Where is data coverage sparse?
- Validate surface vs air temperature over oceans.
- Are there systematic biases in any region?
- Check temporal consistency across datasets.
- Identify sensor errors or anomalies.
- How complete is coverage over remote oceans?

How to respond:
1. Reference dataset metadata (coverage, resolution, known caveats).
2. Explain methods for spotting gaps (e.g., turn on boundary lines, inspect raster alpha mask, compare overlapping datasets).
3. When validation is requested, describe the cross-variable comparison (difference maps, correlation).
4. Encourage reporting suspected data issues with precise coordinates, timestamps, and dataset names.`,
  },
  {
    id: "analysis-multi-factor",
    title: "Complex Multi-Factor Questions",
    category: "analysis-playbook",
    content: `
Scope: combined reasoning questions linking temperature, precipitation, geography, and extremes.

Representative prompts:
- How do temperature and precipitation define climate zones?
- What conditions indicate drought risk?
- Analyse the water cycle using temperature + precipitation.
- How do land–ocean contrasts drive precipitation?
- What precedes major precipitation events?
- Identify regions experiencing both warming and drying.
- How do surface–air temperature differences affect local weather?
- What compound conditions indicate climate stress?

How to respond:
1. Break the request into measurable components (e.g., temperature anomaly + precipitation deficit).
2. Reference relevant datasets and describe how to synthesise them (e.g., compare multi-variable maps, compute joint thresholds).
3. Summarize findings in narrative form, tying statistics to known climate mechanisms.
4. Suggest further steps (scatter plots, time-lag analysis, exporting data for deeper study) when appropriate.`,
  },
];

export default climateQuestionPlaybook;
