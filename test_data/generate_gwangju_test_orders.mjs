import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("../frontend/node_modules/xlsx");

const outputDir = path.resolve("test_data");

const sourceAddresses = [
  ["경안동", "경기도 광주시 경안로 10"],
  ["경안동", "경기도 광주시 경안로 104"],
  ["경안동", "경기도 광주시 경안로 106"],
  ["경안동", "경기도 광주시 경안로 112"],
  ["경안동", "경기도 광주시 경안로 114"],
  ["경안동", "경기도 광주시 경안로 115"],
  ["경안동", "경기도 광주시 경안로 116"],
  ["경안동", "경기도 광주시 경안로 117"],
  ["경안동", "경기도 광주시 경안로 117-15"],
  ["경안동", "경기도 광주시 경안로 118"],
  ["경안동", "경기도 광주시 경안로 119"],
  ["경안동", "경기도 광주시 경안로 120"],
  ["경안동", "경기도 광주시 경안로 121"],
  ["경안동", "경기도 광주시 경안로 122"],
  ["경안동", "경기도 광주시 경안로 123-10"],
  ["경안동", "경기도 광주시 경안로 123-14"],
  ["경안동", "경기도 광주시 경안로 123-9"],
  ["경안동", "경기도 광주시 경안로 124"],
  ["경안동", "경기도 광주시 경안로 124-1"],
  ["경안동", "경기도 광주시 경안로 126"],
  ["경안동", "경기도 광주시 경안로 127"],
  ["송정동", "경기도 광주시 경안천로 110"],
  ["송정동", "경기도 광주시 경안천로 113"],
  ["송정동", "경기도 광주시 경안천로 114"],
  ["송정동", "경기도 광주시 경안천로 115"],
  ["송정동", "경기도 광주시 경안천로 117"],
  ["송정동", "경기도 광주시 경안천로 118"],
  ["송정동", "경기도 광주시 경안천로 119"],
  ["송정동", "경기도 광주시 경안천로 121"],
  ["송정동", "경기도 광주시 경안천로 122"],
  ["송정동", "경기도 광주시 경안천로 124"],
  ["송정동", "경기도 광주시 경안천로 124-1"],
  ["송정동", "경기도 광주시 경안천로 126"],
  ["송정동", "경기도 광주시 경안천로 127"],
  ["송정동", "경기도 광주시 경안천로 129"],
  ["송정동", "경기도 광주시 경안천로 13"],
  ["송정동", "경기도 광주시 경안천로 130"],
  ["송정동", "경기도 광주시 경안천로 131"],
  ["송정동", "경기도 광주시 경안천로 132"],
  ["송정동", "경기도 광주시 경안천로 133"],
  ["송정동", "경기도 광주시 경안천로 134"],
  ["송정동", "경기도 광주시 경안천로 135"],
  ["쌍령동", "경기도 광주시 경충대로 1407-3"],
  ["쌍령동", "경기도 광주시 경충대로 1407-5"],
  ["쌍령동", "경기도 광주시 경충대로 1407-9"],
  ["쌍령동", "경기도 광주시 경충대로 1411"],
  ["쌍령동", "경기도 광주시 경충대로 1413"],
  ["쌍령동", "경기도 광주시 경충대로 1414"],
  ["쌍령동", "경기도 광주시 경충대로 1425"],
  ["쌍령동", "경기도 광주시 경충대로 1428-14"],
  ["쌍령동", "경기도 광주시 경충대로 1428-15"],
  ["쌍령동", "경기도 광주시 경충대로 1428-17"],
  ["쌍령동", "경기도 광주시 경충대로 1428-19"],
  ["쌍령동", "경기도 광주시 경충대로 1429"],
  ["쌍령동", "경기도 광주시 경충대로 1430"],
  ["쌍령동", "경기도 광주시 경충대로 1436"],
  ["쌍령동", "경기도 광주시 경충대로 1438"],
  ["쌍령동", "경기도 광주시 경충대로 1439"],
  ["쌍령동", "경기도 광주시 경충대로 1442-11"],
  ["쌍령동", "경기도 광주시 경충대로 1442-17"],
  ["쌍령동", "경기도 광주시 경충대로 1442-18"],
  ["쌍령동", "경기도 광주시 경충대로 1442-20"],
  ["탄벌동", "경기도 광주시 경안로 197"],
  ["탄벌동", "경기도 광주시 경충대로1926번길 119"],
  ["탄벌동", "경기도 광주시 벌원길 23"],
  ["탄벌동", "경기도 광주시 벌원길 25"],
  ["탄벌동", "경기도 광주시 벌원길 26"],
  ["탄벌동", "경기도 광주시 벌원길 34"],
  ["탄벌동", "경기도 광주시 벌원길 36"],
  ["탄벌동", "경기도 광주시 벌원길 37"],
  ["탄벌동", "경기도 광주시 벌원길 37-4"],
  ["탄벌동", "경기도 광주시 벌원길 37-5"],
  ["탄벌동", "경기도 광주시 벌원길 37-7"],
  ["탄벌동", "경기도 광주시 벌원길 38"],
  ["탄벌동", "경기도 광주시 벌원길 4"],
  ["탄벌동", "경기도 광주시 벌원길 40"],
  ["탄벌동", "경기도 광주시 벌원길 42"],
  ["탄벌동", "경기도 광주시 벌원길 43"],
  ["탄벌동", "경기도 광주시 벌원길 43-1"],
  ["탄벌동", "경기도 광주시 벌원길 43-10"],
  ["탄벌동", "경기도 광주시 벌원길 43-11"],
  ["탄벌동", "경기도 광주시 벌원길 43-2"],
  ["탄벌동", "경기도 광주시 벌원길 43-3"],
];

const headers = ["#", "성명", "전화번호", "배송동", "주소", "상세주소", "물품내역", "코드", "수량", "요청사항"];
const itemNames = ["채소", "과일", "정육", "생선", "반찬", "쌀", "두부", "계란", "건어물", "생활용품"];
const requests = ["문 앞에 놓아주세요", "도착 전 전화 부탁드립니다", "천천히 오셔도 됩니다", "벨 누르지 말아주세요", "경비실 호출 후 전달", "부재 시 문고리에 걸어주세요"];

function phone(index) {
  const mid = String(5500 + Math.floor(index / 100)).padStart(4, "0");
  const end = String(1000 + index).padStart(4, "0");
  return `010-${mid}-${end}`;
}

function detail(index) {
  const building = 101 + (index % 9) * 10;
  const room = 101 + (index % 20);
  return `${building}동 ${room}호`;
}

function makeRows(count) {
  const rows = [];
  const byDong = sourceAddresses.reduce((acc, item) => {
    const [dong] = item;
    acc[dong] = acc[dong] ?? [];
    acc[dong].push(item);
    return acc;
  }, {});
  const dongOrder = ["경안동", "송정동", "쌍령동", "탄벌동"];
  const dongCursor = Object.fromEntries(dongOrder.map((dong) => [dong, 0]));
  for (let i = 0; i < count; i += 1) {
    const dong = dongOrder[i % dongOrder.length];
    const pool = byDong[dong];
    const [_, address] = pool[dongCursor[dong] % pool.length];
    dongCursor[dong] += 1;
    rows.push({
      "#": i + 1,
      "성명": `테스트고객${String(i + 1).padStart(3, "0")}`,
      "전화번호": phone(i + 1),
      "배송동": dong,
      "주소": address,
      "상세주소": detail(i),
      "물품내역": itemNames[i % itemNames.length],
      "코드": `T${String(i + 1).padStart(4, "0")}`,
      "수량": (i % 4) + 1,
      "요청사항": requests[i % requests.length],
    });
  }
  return rows;
}

function writeWorkbook(count, fileName) {
  const rows = makeRows(count);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 34 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 24 },
  ];
  worksheet["!autofilter"] = { ref: `A1:J${count + 1}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "테스트명단");
  XLSX.writeFile(workbook, path.join(outputDir, fileName), { bookType: "xlsx" });
}

fs.mkdirSync(outputDir, { recursive: true });
writeWorkbook(17, "gwangju_4dong_test_orders_17.xlsx");
writeWorkbook(30, "gwangju_4dong_test_orders_30.xlsx");
writeWorkbook(65, "gwangju_4dong_test_orders_65.xlsx");
