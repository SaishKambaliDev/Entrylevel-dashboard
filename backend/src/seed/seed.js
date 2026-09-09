import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import mongoose from "mongoose";
import connectDatabase from "../config/db.js";
import District from "../models/District.js";
import Subdivision from "../models/Subdivision.js";
import Block from "../models/Block.js";
import Village from "../models/Village.js";
import Ulb from "../models/Ulb.js";

dotenv.config();

const STATE_CODE = "20";
const STATE_NAME = "Jharkhand";
const defaultLgdDirectory = fileURLToPath(new URL("../../scratch/lgd_test", import.meta.url));
const lgdDirectory = process.env.LGD_DATA_DIR || defaultLgdDirectory;

function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(value.trim()); value = "";
    } else value += character;
  }
  fields.push(value.trim());
  return fields;
}

function rows(filename) {
  const lines = readFileSync(resolve(lgdDirectory, filename), "utf8").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift());
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] || ""])));
}

function jharkhandRows(filename) {
  return rows(filename).filter((row) => row["State Code"] === STATE_CODE);
}

function bulkUpsert(Model, records) {
  return Model.bulkWrite(records.map((record) => ({
    updateOne: { filter: { lgdCode: record.lgdCode }, update: { $set: record }, upsert: true },
  })), { ordered: false });
}

async function seedGeography() {
  const districtRows = jharkhandRows("districts.31Oct2024.csv");
  const subdivisionRows = jharkhandRows("subdistricts.31Oct2024.csv");
  const blockRows = jharkhandRows("blocks.31Oct2024.csv");
  const villageRows = jharkhandRows("villages_by_blocks.01Apr2026.csv");
  const ulbRows = jharkhandRows("urban_local_bodies.31Oct2024.csv");
  const coverageRows = rows("statewise_ulbs_coverage.30Sep2024.csv").filter((row) => row["State Name (In English)"] === STATE_NAME);

  // The old application stored only demo geography without LGD codes. This touches
  // no application collections (including users), only the five geography collections.
  await Promise.all([
    Village.deleteMany({ lgdCode: { $exists: false } }),
    Block.deleteMany({ lgdCode: { $exists: false } }),
    Subdivision.deleteMany({ lgdCode: { $exists: false } }),
    Ulb.deleteMany({ lgdCode: { $exists: false } }),
    District.deleteMany({ lgdCode: { $exists: false } }),
  ]);

  const districts = districtRows.map((row) => ({
    name: row["District Name (In English)"], lgdCode: Number(row["District Code"]), state: STATE_NAME,
  }));
  await bulkUpsert(District, districts);
  const storedDistricts = await District.find({ lgdCode: { $in: districts.map((district) => district.lgdCode) } }).select("_id lgdCode").lean();
  const districtIds = new Map(storedDistricts.map((district) => [district.lgdCode, district._id]));

  const subdivisions = subdivisionRows.map((row) => ({
    name: row["Sub-district Name"],
    lgdCode: Number(row["Sub-district Code"]),
    districtId: districtIds.get(Number(row["District Code"])),
    state: STATE_NAME,
  }));
  if (subdivisions.some((subdivision) => !subdivision.districtId)) throw new Error("LGD subdivision has no Jharkhand district relationship.");
  await bulkUpsert(Subdivision, subdivisions);
  const storedSubdivisions = await Subdivision.find({ lgdCode: { $in: subdivisions.map((subdivision) => subdivision.lgdCode) } }).select("_id lgdCode").lean();
  const subdivisionIds = new Map(storedSubdivisions.map((subdivision) => [subdivision.lgdCode, subdivision._id]));

  // LGD's village-by-block export supplies the official block-to-subdivision link.
  const blockSubdivisionCodes = new Map();
  for (const row of villageRows) {
    const blockCode = Number(row["Development Block Code"]);
    const subdivisionCode = Number(row["Subdistrict Code"]);
    if (!blockCode || !subdivisionCode) continue;
    if (!blockSubdivisionCodes.has(blockCode)) blockSubdivisionCodes.set(blockCode, new Set());
    blockSubdivisionCodes.get(blockCode).add(subdivisionCode);
  }
  const blocks = blockRows.map((row) => ({
    name: row["Development Block Name (In English)"],
    lgdCode: Number(row["Development Block Code"]),
    districtId: districtIds.get(Number(row["District Code"])),
    subdivisionIds: [...(blockSubdivisionCodes.get(Number(row["Development Block Code"])) || [])].map((code) => subdivisionIds.get(code)),
    state: STATE_NAME,
  }));
  if (blocks.some((block) => !block.districtId || !block.subdivisionIds.length || block.subdivisionIds.some((id) => !id))) throw new Error("LGD block has no district or subdivision relationships.");
  await bulkUpsert(Block, blocks);
  const storedBlocks = await Block.find({ lgdCode: { $in: blocks.map((block) => block.lgdCode) } }).select("_id lgdCode").lean();
  const blockIds = new Map(storedBlocks.map((block) => [block.lgdCode, block._id]));

  const villages = villageRows.map((row) => ({
    name: row["Village Name (In English)"],
    lgdCode: Number(row["Village Code"]),
    districtId: districtIds.get(Number(row["District Code"])),
    subdivisionId: subdivisionIds.get(Number(row["Subdistrict Code"])),
    blockId: blockIds.get(Number(row["Development Block Code"])),
    state: STATE_NAME,
  }));
  if (villages.some((village) => !village.districtId || !village.subdivisionId || !village.blockId)) throw new Error("LGD village has no complete district, subdivision, and block relationship.");
  await bulkUpsert(Village, villages);

  const ulbDistrictCodes = new Map();
  for (const row of coverageRows) {
    const ulbCode = Number(row["Localbody Code"]);
    const districtCode = Number(row["District Code"]);
    if (!ulbCode || !districtCode) continue;
    const prior = ulbDistrictCodes.get(ulbCode);
    if (prior && prior !== districtCode) throw new Error(`LGD ULB ${ulbCode} maps to multiple districts.`);
    ulbDistrictCodes.set(ulbCode, districtCode);
  }
  const ulbs = ulbRows.map((row) => ({
    name: row["Local Body Name (In English)"],
    lgdCode: Number(row["Local Body Code"]),
    districtId: districtIds.get(ulbDistrictCodes.get(Number(row["Local Body Code"]))),
    state: STATE_NAME,
  }));
  if (ulbs.some((ulb) => !ulb.districtId)) throw new Error("LGD ULB has no Jharkhand district relationship.");
  await bulkUpsert(Ulb, ulbs);

  return { districts: districts.length, subdivisions: subdivisions.length, blocks: blocks.length, villages: villages.length, ulbs: ulbs.length };
}

async function seedDatabase() {
  try {
    await connectDatabase();
    const counts = await seedGeography();
    console.log(`LGD geography import completed: ${JSON.stringify(counts)}`);
  } catch (error) {
    console.error("LGD geography import failed:", error.message);
    process.exitCode = 1;
  } finally { await mongoose.connection.close(); }
}

seedDatabase();
