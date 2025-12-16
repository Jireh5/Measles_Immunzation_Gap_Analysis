// --- Configuration ---
const CSV_FILE = "8254a231-62d7-4b6a-99bd-1dabf7e74cc1.csv";
const GEOJSON_FILE = "countries.geojson";
const TARGET_RATE = 95.0;

// --- Global State ---
let globalData = []; 
let currentSort = { key: "Vaccination Rate (%)", order: "asc" };
let selectedCountries = []; 

// --- Color Palette ---
const RATE_COLORS = {
    GREEN: '#10b981', YELLOW_GREEN: '#84cc16', YELLOW: '#eab308',
    YELLOW_ORANGE: '#f59e0b', ORANGE: '#f97316', RED_ORANGE: '#ea580c',
    RED: '#ef4444', NODATA: '#cbd5e1'
};
const LINE_COLORS = ["#2563eb", "#d946ef", "#f97316", "#06b6d4", "#84cc16", "#64748b", "#f43f5e", "#8b5cf6", "#14b8a6", "#eab308"];

function getRateColor(rate) {
    if (rate === null || rate === undefined) return RATE_COLORS.NODATA;
    if (rate >= 95) return RATE_COLORS.GREEN;
    if (rate >= 90) return RATE_COLORS.YELLOW_GREEN;
    if (rate >= 80) return RATE_COLORS.YELLOW;
    if (rate >= 70) return RATE_COLORS.YELLOW_ORANGE;
    if (rate >= 60) return RATE_COLORS.ORANGE;
    if (rate >= 50) return RATE_COLORS.RED_ORANGE;
    return RATE_COLORS.RED;
}

// --- Data Processing ---
function processData(rawData) {
    return rawData.filter(d => 
        d.IndicatorCode === "WHS8_110" && 
        !isNaN(parseFloat(d.FactValueNumeric)) &&
        parseInt(d.Period) >= 2022
    ).map(d => ({
        "Country Name": d.Location,
        "ISO3": d.SpatialDimValueCode,
        "Vaccination Rate (%)": parseFloat(d.FactValueNumeric),
        "Region": d.ParentLocation,
        "Year": parseInt(d.Period)
    }));
}

function getLatestSnapshot(data) {
    const latestMap = new Map();
    [...data].sort((a, b) => a.Year - b.Year).forEach(d => latestMap.set(d["Country Name"], d));
    return Array.from(latestMap.values());
}

function calculateMetrics(data) {
    // 1. Total Records
    const totalRecords = data.length;
    // 2. Snapshot Metrics
    const snapshot = getLatestSnapshot(data);
    const globalAvg = d3.mean(snapshot, d => d["Vaccination Rate (%)"]);
    const belowTargetCount = snapshot.filter(d => d["Vaccination Rate (%)"] < TARGET_RATE).length;
    
    return { 
        total_records: totalRecords,
        global_average: globalAvg ? globalAvg.toFixed(1) : "0.0",
        below_target_count: belowTargetCount, 
        target_rate: TARGET_RATE 
    };
}

// --- Renderers ---
function renderMetrics(metrics) {
    d3.select("#metrics-container").html(`
        <div class="metric-card"><div class="value">${metrics.total_records}</div><div class="label">Total Records Loaded</div></div>
        <div class="metric-card"><div class="value">${metrics.global_average}%</div><div class="label">Avg Coverage (Latest)</div></div>
        <div class="metric-card"><div class="value">${metrics.below_target_count}</div><div class="label">Countries Below Target</div></div>
        <div class="metric-card"><div class="value">${metrics.target_rate}%</div><div class="label">Target Rate</div></div>
    `);
}

function renderMap(geoData, dataMap) {
    const container = d3.select("#choropleth-map");
    container.select("svg").remove(); 
    const width = container.node().clientWidth;
    const height = 500;
    const svg = container.append("svg").attr("viewBox", `0 0 ${width} ${height}`).style("position", "absolute").style("top", "0").style("left", "0");
    const g = svg.append("g");
    const projection = d3.geoMercator().scale(130).translate([width / 2, height / 1.5]);
    const path = d3.geoPath().projection(projection);
    
    g.selectAll("path").data(geoData.features).join("path")
        .attr("d", path)
        .attr("fill", d => {
            const data = dataMap.get(d.properties["ISO3166-1-Alpha-3"]);
            return data ? getRateColor(data["Vaccination Rate (%)"]) : RATE_COLORS.NODATA;
        })
        .attr("stroke", "white").attr("stroke-width", "0.5px")
        .on("mouseover", (event, d) => {
            const data = dataMap.get(d.properties["ISO3166-1-Alpha-3"]);
            d3.select("#info-country").text(d.properties.name);
            const rDiv = d3.select("#info-rate");
            const yDiv = d3.select("#info-year");
            if (data) {
                const rate = data["Vaccination Rate (%)"];
                rDiv.text(rate.toFixed(1) + "%").style("color", getRateColor(rate));
                yDiv.text("Year: " + data.Year);
            } else { rDiv.text("No Data").style("color", "#cbd5e1"); yDiv.text(""); }
            d3.select(event.currentTarget).attr("stroke", "#333").attr("stroke-width", "1px").raise();
        })
        .on("mouseout", (event) => d3.select(event.currentTarget).attr("stroke", "white").attr("stroke-width", "0.5px"));

    const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", e => { g.attr("transform", e.transform); g.selectAll("path").attr("stroke-width", 0.5 / e.transform.k + "px"); });
    svg.call(zoom);
    d3.select("#reset-zoom").on("click", () => svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity));
}

function renderBarChart(data) {
    const top10Data = [...data].sort((a, b) => a["Vaccination Rate (%)"] - b["Vaccination Rate (%)"]).slice(0, 10);
    const container = d3.select("#bar-chart");
    container.html("");
    const containerWidth = container.node().clientWidth;
    const height = 500;
    const TEXT_WIDTH = 220, ROW_HEIGHT = 45, BAR_START_X = TEXT_WIDTH + 10, LABEL_WIDTH = 50;
    const MAX_BAR_WIDTH = containerWidth - BAR_START_X - LABEL_WIDTH; 

    const svg = container.append("svg").attr("width", containerWidth).attr("height", height);
    const x = d3.scaleLinear().domain([0, 100]).range([0, MAX_BAR_WIDTH]);
    const rows = svg.selectAll(".row").data(top10Data).join("g").attr("class", "row").attr("transform", (d, i) => `translate(0, ${i * ROW_HEIGHT + 20})`); 

    rows.append("text").attr("x", 0).attr("y", ROW_HEIGHT / 2).attr("dy", "0.35em").text(d => d["Country Name"]).style("font-size", "14px").style("font-weight", "500").style("fill", "#1e293b").append("title").text(d => d["Country Name"]);
    rows.append("rect").attr("x", BAR_START_X).attr("y", 12).attr("height", ROW_HEIGHT - 24).attr("width", MAX_BAR_WIDTH).attr("fill", "#f1f5f9").attr("rx", 4);
    rows.append("rect").attr("x", BAR_START_X).attr("y", 12).attr("height", ROW_HEIGHT - 24).attr("width", 0).attr("fill", d => getRateColor(d["Vaccination Rate (%)"])).attr("rx", 4).transition().duration(1000).attr("width", d => x(d["Vaccination Rate (%)"]));
    rows.append("text").attr("x", BAR_START_X + 10).attr("y", ROW_HEIGHT / 2).attr("dy", "0.35em").text(d => d["Vaccination Rate (%)"].toFixed(1) + "%").style("font-size", "12px").style("font-weight", "bold").style("fill", "#333").transition().duration(1000).attr("x", d => BAR_START_X + x(d["Vaccination Rate (%)"]) + 8);
}

// --- Comparison Tool ---
function initComparisonTools(data) {
    const select = d3.select("#country-select-dropdown");
    const uniqueCountries = getLatestSnapshot(data).sort((a, b) => a["Country Name"].localeCompare(b["Country Name"]));
    uniqueCountries.forEach(d => select.append("option").attr("value", d["Country Name"]).text(d["Country Name"]));

    d3.select("#add-country-btn").on("click", () => {
        const countryName = select.property("value");
        if (countryName && !selectedCountries.includes(countryName)) { selectedCountries.push(countryName); updateComparisonView(); }
    });
    d3.select("#clear-comparison-btn").on("click", () => { selectedCountries = []; updateComparisonView(); });
}

function updateComparisonView() {
    const tagContainer = d3.select("#selected-countries-list");
    const chartContainer = d3.select("#comparison-chart");
    const tableContainer = d3.select("#comparison-table-container");

    tagContainer.html("");
    selectedCountries.forEach((name, i) => {
        const color = LINE_COLORS[i % LINE_COLORS.length];
        const tag = tagContainer.append("div").attr("class", "tag").style("background-color", color + "15").style("color", color).style("border", `1px solid ${color}`);
        tag.html(`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>${name}`);
        tag.append("span").attr("class", "tag-remove").html("&times;").on("click", () => { selectedCountries.splice(i, 1); updateComparisonView(); });
    });

    if (selectedCountries.length === 0) { chartContainer.html("<div style='color:#94a3b8;font-size:0.9rem;'>Select countries above to compare trends.</div>"); tableContainer.html(""); return; }

    const comparisonData = globalData.filter(d => selectedCountries.includes(d["Country Name"]) && d.Year >= 2022);
    const groupedData = d3.group(comparisonData, d => d["Country Name"]);
    const years = Array.from(new Set(comparisonData.map(d => d.Year))).sort((a,b)=>a-b);

    chartContainer.html("");
    const margin = { top: 20, right: 30, bottom: 30, left: 40 };
    const width = chartContainer.node().clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    const svg = chartContainer.append("svg").attr("width", width+margin.left+margin.right).attr("height", height+margin.top+margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    
    const x = d3.scalePoint().domain(years).range([0, width]).padding(0.1);
    const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickFormat(d3.format("d"))).selectAll("text").style("color", "#64748b");
    svg.append("g").call(d3.axisLeft(y).ticks(5)).selectAll("text").style("color", "#64748b");

    const line = d3.line().x(d => x(d.Year)).y(d => y(d["Vaccination Rate (%)"]));
    selectedCountries.forEach((country, i) => {
        const countryData = groupedData.get(country);
        if (!countryData) return;
        countryData.sort((a,b) => a.Year - b.Year);
        const color = LINE_COLORS[i % LINE_COLORS.length];
        svg.append("path").datum(countryData).attr("fill", "none").attr("stroke", color).attr("stroke-width", 3).attr("d", line);
        svg.selectAll(`.dot-${i}`).data(countryData).join("circle").attr("cx", d => x(d.Year)).attr("cy", d => y(d["Vaccination Rate (%)"])).attr("r", 5).attr("fill", "white").attr("stroke", color).attr("stroke-width", 2);
    });

    let tableHtml = `<table><thead><tr><th>Country</th>`;
    years.forEach(y => tableHtml += `<th>${y}</th>`);
    tableHtml += `</tr></thead><tbody>`;
    selectedCountries.forEach(country => {
        const countryData = groupedData.get(country) || [];
        const rateMap = new Map(countryData.map(d => [d.Year, d["Vaccination Rate (%)"]]));
        tableHtml += `<tr><td><strong>${country}</strong></td>`;
        years.forEach(y => {
            const rate = rateMap.get(y);
            tableHtml += rate !== undefined ? `<td>${rate.toFixed(1)}%</td>` : `<td style="color:#ccc">-</td>`;
        });
        tableHtml += `</tr>`;
    });
    tableContainer.html(tableHtml + "</tbody></table>");
}

// --- Filters & Sorting ---
function populateFilters(data) {
    const regionSelect = d3.select("#region-filter");
    const globalYearSelect = d3.select("#year-filter");
    const tableYearSelect = d3.select("#table-year-filter");

    const regions = Array.from(new Set(data.map(d => d.Region))).filter(r => r).sort();
    regions.forEach(r => regionSelect.append("option").attr("value", r).text(r));

    const years = Array.from(new Set(data.map(d => d.Year))).sort((a,b) => b-a);
    years.forEach(y => { globalYearSelect.append("option").attr("value", y).text(y); tableYearSelect.append("option").attr("value", y).text(y); });
}

window.handleSort = function(key) {
    if (currentSort.key === key) { currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; } 
    else { currentSort.key = key; currentSort.order = 'asc'; }
    filterData();
};

function filterData() {
    const searchTerm = d3.select("#search-input").property("value").toLowerCase();
    const selectedRegion = d3.select("#region-filter").property("value");
    const globalYear = d3.select("#year-filter").property("value");
    const tableYear = d3.select("#table-year-filter").property("value");

    // Table Filter
    let tableFiltered = globalData.filter(d => {
        const matchesSearch = d["Country Name"].toLowerCase().includes(searchTerm);
        const matchesRegion = selectedRegion === "All" || d.Region === selectedRegion;
        const matchesTableYear = tableYear === "All" || d.Year == tableYear;
        return matchesSearch && matchesRegion && matchesTableYear;
    });
    tableFiltered.sort((a, b) => {
        let valA = a[currentSort.key], valB = b[currentSort.key];
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        return currentSort.order === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
    renderTable(tableFiltered);

    // Visual Filter
    let visualFiltered = globalData.filter(d => globalYear === "All" || d.Year == globalYear);
    const snapshot = (globalYear === "All") ? getLatestSnapshot(visualFiltered) : visualFiltered;
    // Calculate metrics including the new total count based on filtered visual data
    const metrics = calculateMetrics(visualFiltered);
    
    const dataMap = new Map(snapshot.map(d => [d.ISO3, d]));
    renderMap(window.geoJsonData, dataMap);
    renderBarChart(snapshot);
    renderMetrics(metrics);
    d3.select("#map-year-label").text(globalYear === "All" ? "(Latest Available)" : `(${globalYear})`);
}

function renderTable(data) {
    const container = d3.select("#summary-table");
    if (data.length === 0) { container.html("<div style='padding:2rem; text-align:center; color:var(--text-secondary);'>No matching records.</div>"); return; }
    const tableData = data.length > 500 ? data.slice(0, 100) : data;
    const getIcon = (k) => currentSort.key !== k ? '<span class="sort-icon">↕</span>' : (currentSort.order === 'asc' ? '<span class="sort-icon">↑</span>' : '<span class="sort-icon">↓</span>');
    
    let html = `<table><thead><tr>
        <th onclick="handleSort('Country Name')">Country ${getIcon('Country Name')}</th>
        <th onclick="handleSort('Region')">Region ${getIcon('Region')}</th>
        <th onclick="handleSort('Vaccination Rate (%)')">Rate ${getIcon('Vaccination Rate (%)')}</th>
        <th onclick="handleSort('Year')">Year ${getIcon('Year')}</th>
    </tr></thead><tbody>`;
    
    tableData.forEach(d => {
        const color = getRateColor(d["Vaccination Rate (%)"]);
        html += `<tr><td><strong>${d["Country Name"]}</strong></td><td>${d["Region"]}</td>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;"></span>${d["Vaccination Rate (%)"].toFixed(1)}%</td>
        <td>${d["Year"]}</td></tr>`;
    });
    html += "</tbody></table>";
    if (data.length > 500) html += "<div style='text-align:center;color:#64748b;padding:10px;font-size:0.85rem;'>Showing top 100 results. Use filters to narrow down.</div>";
    container.html(html);
}

async function init() {
    try {
        const [rawData, geoJson] = await Promise.all([d3.csv(CSV_FILE), d3.json(GEOJSON_FILE)]);
        window.geoJsonData = geoJson;
        globalData = processData(rawData);
        
        const snapshot = getLatestSnapshot(globalData);
        // Initial metrics calculation using all valid data
        const metrics = calculateMetrics(globalData);
        const dataMap = new Map(snapshot.map(d => [d.ISO3, d]));

        renderMetrics(metrics);
        renderMap(geoJson, dataMap);
        renderBarChart(snapshot);
        initComparisonTools(globalData);
        populateFilters(globalData);
        renderTable(globalData);

        d3.select("#search-input").on("input", filterData);
        d3.select("#region-filter").on("change", filterData);
        d3.select("#year-filter").on("change", filterData);
        d3.select("#table-year-filter").on("change", filterData);

        window.addEventListener('resize', () => { 
            renderMap(geoJson, dataMap); 
            renderBarChart(snapshot); 
            updateComparisonView();
        });
    } catch (e) { console.error(e); }
}
init();