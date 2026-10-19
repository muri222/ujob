const NS = "http://www.w3.org/2000/svg";

const HEAD = `
  <path class="mascot__tuft" d="M2119 401.474C2027.17 417.793 1801.86 413.202 1757.43 232C1739.66 334.402 1742.54 551.364 1896.28 600C1924.79 558.932 2033.69 455.275 2119 401.474Z"/>
  <ellipse class="mascot__ring" cx="2176" cy="923.5" rx="492" ry="486.5"/>
  <g class="mascot__look"><rect class="mascot__eye" x="2078" y="923" width="103" height="156" rx="40"/><rect class="mascot__eye" x="2354" y="923" width="103" height="156" rx="40"/></g>
  <path class="mascot__cap" d="M1751.49 954C1751.49 922.187 2056.63 716.665 2586.89 800.024L2602 729.294L2432.11 522.002C2401.01 500.42 2274.72 462.044 2018.32 481.196C1761.91 500.348 1743.15 729.294 1751.49 954Z"/>
  <path class="mascot__cup mascot__cup--left" d="M1698 736C1743.84 736 1781 773.16 1781 819V1028C1781 1073.84 1743.84 1111 1698 1111C1652.16 1111 1615 1073.84 1615 1028V819C1615 773.16 1652.16 736 1698 736Z"/>
  <path class="mascot__cup mascot__cup--right" d="M2671 736C2708 736 2738 765.997 2738 803V1038C2738 1075 2708 1105 2671 1105C2634 1105 2604 1075 2604 1038V803C2604 765.997 2634 736 2671 736Z"/>`;

const WIRES_FULL = [
  "M1690.5 1126.5C1670.33 1261.33 1622 1549.41 1972 1658C2249.2 1744 2356.83 1942.83 2376 2031.5",
  "M2668 1125.5C2676.41 1260.26 2733 1439 2544.55 1657.71C2369.85 1860.47 2384 1942.38 2376 2031",
];
const WIRES_SHORT = ["M1690.5 1126.5C1675 1300 1700 1480 1900 1540C2050 1585 2140 1560 2176 1600", "M2668 1125.5C2682 1300 2652 1480 2452 1540C2302 1585 2212 1560 2176 1600"];

const WORDMARK =
  "M1558.6 2098.1C1483 2102.3 1421.8 2085.5 1375 2047.7C1328.8 2009.9 1303.9 1956.8 1300.3 1888.4L1288.6 1655.3C1286.8 1620.5 1296.1 1592.9 1316.5 1572.5C1335.7 1553.9 1359.1 1544.6 1386.7 1544.6C1412.5 1544.6 1434.4 1552.7 1452.4 1568.9C1472.8 1587.5 1483.6 1612.7 1484.8 1644.5L1497.4 1875.8C1499.2 1907.6 1515.7 1923.5 1546.9 1923.5C1560.7 1923.5 1572.7 1918.7 1582.9 1909.1C1593.1 1899.5 1597.9 1886.6 1597.3 1870.4L1584.7 1639.1C1582.9 1604.9 1592.5 1577.6 1613.5 1557.2C1632.1 1538 1655.2 1528.4 1682.8 1528.4C1708.6 1528.4 1730.5 1536.8 1748.5 1553.6C1768.9 1572.2 1780 1597.4 1781.8 1629.2L1794.4 1863.2C1797.4 1931.6 1777.9 1986.8 1735.9 2028.8C1693.9 2070.8 1634.8 2093.9 1558.6 2098.1ZM1982.01 2094.5C1967.01 2096.9 1950.81 2098.1 1933.41 2098.1C1889.61 2098.1 1851.81 2089.7 1820.01 2072.9C1780.41 2051.9 1760.61 2021.3 1760.61 1981.1C1760.61 1961.3 1766.31 1943.3 1777.71 1927.1C1790.31 1907.9 1807.71 1896.5 1829.91 1892.9C1834.71 1891.7 1840.11 1891.1 1846.11 1891.1C1857.51 1891.1 1874.61 1894.4 1897.41 1901C1917.81 1906.4 1932.51 1908.2 1941.51 1906.4C1950.51 1905.2 1955.01 1899.5 1955.01 1889.3C1955.01 1888.7 1953.51 1879.7 1950.51 1862.3L1883.91 1481.6C1882.11 1473.8 1881.21 1466.3 1881.21 1459.1C1881.21 1429.1 1892.01 1404.5 1913.61 1385.3C1933.41 1367.9 1957.11 1359.2 1984.71 1359.2C2008.11 1359.2 2028.51 1366.4 2045.91 1380.8C2065.71 1396.4 2078.01 1418.3 2082.81 1446.5L2152.11 1836.2C2155.11 1856 2156.61 1874.9 2156.61 1892.9C2156.61 1952.9 2137.71 2001.2 2099.91 2037.8C2069.31 2066.6 2030.01 2085.5 1982.01 2094.5ZM2374.32 2098.1C2295.72 2102.3 2229.72 2077.4 2176.32 2023.4C2125.32 1971.8 2097.72 1907 2093.52 1829C2089.32 1753.4 2110.32 1686.5 2156.52 1628.3C2204.52 1567.7 2266.92 1535.3 2343.72 1531.1C2421.12 1526.9 2486.82 1552.7 2540.82 1608.5C2593.02 1661.3 2620.92 1725.8 2624.52 1802C2628.72 1879.4 2608.02 1946.3 2562.42 2002.7C2515.02 2062.1 2452.32 2093.9 2374.32 2098.1ZM2353.62 1717.4C2333.22 1718 2317.32 1727.6 2305.92 1746.2C2295.12 1764.2 2289.72 1785.5 2289.72 1810.1C2289.72 1838.3 2296.02 1862 2308.62 1881.2C2322.42 1902.8 2341.02 1913 2364.42 1911.8C2384.82 1911.2 2400.72 1901.3 2412.12 1882.1C2422.92 1865.3 2428.32 1844.3 2428.32 1819.1C2428.32 1791.5 2422.02 1767.8 2409.42 1748C2395.02 1726.4 2376.42 1716.2 2353.62 1717.4ZM2787.61 2092.7C2746.81 2083.1 2713.51 2063.3 2687.71 2033.3C2672.11 2044.1 2654.41 2049.5 2634.61 2049.5C2608.21 2049.5 2585.11 2040.2 2565.31 2021.6C2544.91 2002.4 2534.71 1978.1 2534.71 1948.7C2534.71 1939.7 2535.61 1930.4 2537.41 1920.8L2662.51 1380.8C2669.11 1353.2 2681.71 1332.2 2700.31 1317.8C2717.11 1304 2736.61 1297.1 2758.81 1297.1C2785.21 1297.1 2808.31 1306.1 2828.11 1324.1C2847.91 1342.1 2857.81 1365.8 2857.81 1395.2C2857.81 1404.8 2856.61 1414.7 2854.21 1424.9L2828.11 1538.3C2858.71 1532.3 2889.31 1532.9 2919.91 1540.1C2981.11 1554.5 3027.31 1586.9 3058.51 1637.3C3086.11 1681.1 3099.91 1733.6 3099.91 1794.8C3099.91 1823 3096.91 1850.6 3090.91 1877.6C3077.11 1938.2 3048.01 1989.5 3003.61 2031.5C2955.61 2076.5 2901.31 2099 2840.71 2099C2823.31 2099 2805.61 2096.9 2787.61 2092.7ZM2843.41 1715.6C2820.61 1715.6 2801.71 1727.3 2786.71 1750.7C2772.31 1774.1 2765.11 1800.2 2765.11 1829C2765.11 1850 2769.61 1867.7 2778.61 1882.1C2789.41 1899.5 2804.71 1908.2 2824.51 1908.2C2841.31 1908.2 2856.61 1901 2870.41 1886.6C2884.81 1871.6 2894.71 1852.1 2900.11 1828.1C2902.51 1816.7 2903.71 1805.6 2903.71 1794.8C2903.71 1773.8 2898.61 1755.5 2888.41 1739.9C2878.21 1723.7 2863.21 1715.6 2843.41 1715.6Z";

const JACK = "M2366 2018h20a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8h-20a8 8 0 0 1-8-8v-58a8 8 0 0 1 8-8z";

const wires = (paths) =>
  paths.map((d) => `<path class="mascot__wire" d="${d}" pathLength="100"/><path class="mascot__signal" d="${d}" pathLength="100"/>`).join("");

const VARIANTS = {
  mark: { box: "1430 170 1490 1490", body: `${wires(WIRES_SHORT)}${HEAD}<circle class="mascot__plug" cx="2176" cy="1600" r="38"/>` },
  full: { box: "1250 170 1900 1960", body: `${wires(WIRES_FULL)}${HEAD}<path class="mascot__word" d="${WORDMARK}"/><path class="mascot__plug" d="${JACK}"/>` },
  word: { box: "1270 1280 1850 840", body: `<path class="mascot__word" d="${WORDMARK}"/>` },
};

const mascots = new Set();
let pointer = null;
let frame = 0;

function aim() {
  frame = 0;
  for (const svg of mascots) {
    if (!svg.isConnected) {
      mascots.delete(svg);
      continue;
    }
    const look = svg.querySelector(".mascot__look");
    if (!look || svg.classList.contains("is-shy")) continue;
    const box = svg.getBoundingClientRect();
    const target = svg.lookAt ?? pointer;
    if (!target || !box.width) continue;
    const dx = target.x - (box.left + box.width / 2);
    const dy = target.y - (box.top + box.height * 0.42);
    const distance = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, distance / 260) * 46;
    look.style.transform = `translate(${((dx / distance) * reach).toFixed(1)}px, ${((dy / distance) * reach * 0.8).toFixed(1)}px)`;
  }
}

const schedule = () => frame || (frame = requestAnimationFrame(aim));

addEventListener(
  "pointermove",
  (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  },
  { passive: true },
);

export function mascot(variant = "mark", { label = "ujob", className = "" } = {}) {
  const { box, body } = VARIANTS[variant];
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", box);
  svg.setAttribute("class", `mascot mascot--${variant} ${className}`.trim());
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.innerHTML = body;
  if (variant !== "word") {
    mascots.add(svg);
    svg.addEventListener("click", () => cheer(svg));
  }
  return svg;
}

export function cheer(svg) {
  svg.classList.remove("is-happy");
  void svg.getBoundingClientRect();
  svg.classList.add("is-happy");
  setTimeout(() => svg.classList.remove("is-happy"), 900);
}

export function shy(svg, on) {
  svg.classList.toggle("is-shy", on);
  if (on) svg.querySelector(".mascot__look").style.transform = "";
  else schedule();
}

export function lookAt(svg, point) {
  svg.lookAt = point;
  schedule();
}

export function mountBrand() {
  for (const slot of document.querySelectorAll("[data-brand]")) {
    const variant = slot.dataset.brand;
    if (variant === "full") slot.replaceChildren(mascot("full"));
    else slot.replaceChildren(mascot("mark", { label: "" }), mascot("word", { label: "ujob" }));
  }
}

export function busy(on) {
  document.documentElement.classList.toggle("is-collecting", on);
}
