interface Stats {
  countries: number;
  states: number;
  cities: number;
}

export function renderStats(el: HTMLElement, stats: Stats): void {
  el.hidden = false;
  el.innerHTML = `
    <h2>Stats</h2>
    <div class="stat-row"><span>Countries</span><span class="stat-value">${stats.countries}</span></div>
    <div class="stat-row"><span>States/regions</span><span class="stat-value">${stats.states}</span></div>
    <div class="stat-row"><span>Cities</span><span class="stat-value">${stats.cities}</span></div>
  `;
}
