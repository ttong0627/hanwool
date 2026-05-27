import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("../frontend/node_modules/xlsx");

const allowedDongs = new Set(["경안동", "송정동", "쌍령동", "탄벌동"]);
const files = [
  ["gwangju_4dong_test_orders_30.xlsx", 30],
  ["gwangju_4dong_test_orders_65.xlsx", 65],
];

for (const [fileName, expectedCount] of files) {
  const workbook = XLSX.readFile(`test_data/${fileName}`);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet);
  const dongs = [...new Set(rows.map((row) => row["배송동"]))];
  const phonesOk = rows.every((row) => /^010-\d{4}-\d{4}$/.test(row["전화번호"]));
  const addressesOk = rows.every((row) => {
    const address = String(row["주소"] || "");
    return allowedDongs.has(row["배송동"]) && address.includes("경기도 광주시") && /\d+동 \d+호$/.test(address);
  });
  if (rows.length !== expectedCount || dongs.length !== 4 || !phonesOk || !addressesOk) {
    throw new Error(
      `${fileName} 검증 실패: rows=${rows.length}, dongs=${dongs.join("/")}, phones=${phonesOk}, addresses=${addressesOk}`,
    );
  }
  console.log(`${fileName}: ${rows.length}건, 4개동 포함, 전화번호/주소 형식 정상`);
}
