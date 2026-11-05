import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const username = process.env.PROFILE_USER || "CloudYiC";
const token = process.env.GH_TOKEN || "";
const outputFile = process.env.OUTPUT_FILE || "assets/live-metrics.svg";
const useMockData = process.env.DASHBOARD_MOCK === "1";

async function github(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "cloudyic-profile-dashboard",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shortNumber(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function languageColor(language) {
  const colors = {
    C: "#22D3EE",
    "C++": "#60A5FA",
    Python: "#FACC15",
    JavaScript: "#F7DF1E",
    TypeScript: "#3178C6",
    Shell: "#34D399",
    CMake: "#818CF8",
    HTML: "#F97316",
    CSS: "#A855F7",
  };
  return colors[language] || "#C084FC";
}

let user;
let repositories;

if (useMockData) {
  user = { public_repos: 18, followers: 26, created_at: "2021-01-01T00:00:00Z" };
  repositories = [
    { name: "embedded-toolkit", language: "C++", stargazers_count: 21, forks_count: 5, fork: false, pushed_at: "2026-08-20" },
    { name: "protocol-lab", language: "C", stargazers_count: 13, forks_count: 3, fork: false, pushed_at: "2026-08-18" },
    { name: "python-workbench", language: "Python", stargazers_count: 8, forks_count: 2, fork: false, pushed_at: "2026-08-12" },
    { name: "react-console", language: "JavaScript", stargazers_count: 3, forks_count: 1, fork: false, pushed_at: "2026-08-10" },
  ];
} else {
  [user, repositories] = await Promise.all([
    github(`/users/${encodeURIComponent(username)}`),
    github(`/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=updated`),
  ]);
}

const ownedRepositories = repositories.filter((repository) => !repository.fork);
const stars = ownedRepositories.reduce((total, repository) => total + repository.stargazers_count, 0);
const forks = ownedRepositories.reduce((total, repository) => total + repository.forks_count, 0);

const languageCounts = new Map();
const visibleLanguages = new Set(["C", "C++", "Python", "JavaScript", "TypeScript", "Shell", "CMake", "HTML", "CSS"]);
for (const repository of ownedRepositories) {
  if (!repository.language || !visibleLanguages.has(repository.language)) continue;
  languageCounts.set(repository.language, (languageCounts.get(repository.language) || 0) + 1);
}

const languages = [...languageCounts.entries()]
  .sort((left, right) => right[1] - left[1])
  .slice(0, 4);
const languageTotal = Math.max(1, languages.reduce((total, [, count]) => total + count, 0));

const topRepositories = [...ownedRepositories]
  .sort((left, right) => right.stargazers_count - left.stargazers_count || new Date(right.pushed_at) - new Date(left.pushed_at))
  .slice(0, 3);

const accountYears = Math.max(1, new Date().getUTCFullYear() - new Date(user.created_at).getUTCFullYear());
const syncedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

const stats = [
  ["PUBLIC REPOSITORIES", shortNumber(user.public_repos), "#0369A1", "#60A5C8"],
  ["FOLLOWERS", shortNumber(user.followers), "#2563EB", "#6FA8D8"],
  ["STARS EARNED", shortNumber(stars), "#7C3AED", "#9B8BD4"],
  ["FORKS", shortNumber(forks), "#9333EA", "#B28AD7"],
];

const statCards = stats.map(([label, value, color, border], index) => {
  const x = 40 + index * 280;
  return `<g transform="translate(${x} 72)"><rect width="260" height="105" rx="12" fill="#09111F" stroke="${border}"/><text class="m" x="18" y="27" fill="#64748B" font-size="10">${label}</text><text class="m" x="18" y="73" fill="${color}" font-size="35">${value}</text><text class="m" x="239" y="74" text-anchor="end" fill="${border}" font-size="26">0${index + 1}</text></g>`;
}).join("");

const languageRows = (languages.length ? languages : [["NO DATA", 1]])
  .map(([language, count], index) => {
    const y = 50 + index * 23;
    const width = Math.max(14, Math.round((count / languageTotal) * 465));
    const percentage = Math.round((count / languageTotal) * 100);
    return `<text class="m" x="18" y="${y + 8}" fill="#94A3B8" font-size="10">${escapeXml(language.slice(0, 12))}</text><rect x="112" y="${y}" width="505" height="9" rx="4" fill="#162033"/><rect x="112" y="${y}" width="${width}" height="9" rx="4" fill="${languageColor(language)}"/><text class="m" x="633" y="${y + 8}" text-anchor="end" fill="#475569" font-size="9">${percentage}%</text>`;
  }).join("");

const repositoryRows = (topRepositories.length ? topRepositories : [{ name: "NO PUBLIC MODULES", stargazers_count: 0 }])
  .map((repository, index) => {
    const y = 55 + index * 29;
    const name = escapeXml(repository.name.slice(0, 25));
    return `<text class="m" x="18" y="${y}" fill="#CBD5E1" font-size="11">${String(index + 1).padStart(2, "0")}  ${name}</text><text class="m" x="342" y="${y}" text-anchor="end" fill="#A78BFA" font-size="10">★ ${repository.stargazers_count}</text>`;
  }).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="370" viewBox="0 0 1200 370" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} live GitHub metrics</title><desc id="desc">Automatically generated public GitHub repository, follower, star, fork and language metrics.</desc>
  <defs><linearGradient id="bg"><stop stop-color="#7ECDF5"/><stop offset=".55" stop-color="#D8F0FD"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient><linearGradient id="g"><stop stop-color="#0284C7"/><stop offset=".5" stop-color="#3B82F6"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient><pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#075985" stroke-opacity=".07"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="cloud"><feGaussianBlur stdDeviation="12"/></filter></defs>
  <style>.m{font-family:"Cascadia Code",Consolas,monospace}.p{animation:p 2s ease-in-out infinite}[fill="#09111F"],[fill="#080E18"]{fill:#FFFFFF;fill-opacity:.84}[fill="#162033"]{fill:#D7ECF8}[fill="#CBD5E1"]{fill:#153B56}[fill="#94A3B8"]{fill:#365F7A}[fill="#64748B"]{fill:#52758C}[fill="#475569"],[fill="#334155"]{fill:#6FA4C2}[fill="#A78BFA"]{fill:#7C3AED}[stroke="#334155"],[stroke="#25354B"],[stroke="#302C51"]{stroke:#78BCE1}@keyframes p{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.p{animation:none}}</style>
  <rect width="1200" height="370" rx="22" fill="url(#bg)"/><rect width="1200" height="370" rx="22" fill="url(#grid)"/><g fill="#FFFFFF" opacity=".5" filter="url(#cloud)"><ellipse cx="170" cy="350" rx="150" ry="34"/><ellipse cx="270" cy="338" rx="95" ry="44"/><ellipse cx="1080" cy="40" rx="125" ry="30"/></g><rect x="1" y="1" width="1198" height="368" rx="21" fill="none" stroke="#334155"/>
  <text class="m" x="40" y="38" fill="#0369A1" font-size="13" letter-spacing="2">03 // LIVE GITHUB TELEMETRY</text><circle class="p" cx="1138" cy="33" r="4" fill="#22C55E" filter="url(#glow)"/><text class="m" x="1124" y="37" text-anchor="end" fill="#64748B" font-size="10">SYNCED ${syncedAt}</text>
  ${statCards}
  <g transform="translate(40 204)"><rect width="680" height="126" rx="12" fill="#080E18" stroke="#25354B"/><text class="m" x="18" y="26" fill="#64748B" font-size="10">LANGUAGE SIGNAL // PRIMARY REPOSITORY LANGUAGE</text>${languageRows}</g>
  <g transform="translate(740 204)"><rect width="420" height="126" rx="12" fill="#080E18" stroke="#302C51"/><text class="m" x="18" y="26" fill="#A78BFA" font-size="10">TOP MODULES // PUBLIC</text>${repositoryRows}</g>
  <text class="m" x="1148" y="354" text-anchor="end" fill="#334155" font-size="9">ACCOUNT AGE ${accountYears}Y // LOCAL SVG // SOURCE GITHUB API</text>
</svg>`;

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, svg, "utf8");
console.log(`Updated ${outputFile} for ${username}`);
