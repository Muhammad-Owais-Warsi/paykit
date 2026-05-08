import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEVICE_CONFIG_PATH = path.join(os.homedir(), ".config", "paykit.json");

interface DeviceConfig {
  deviceToken: string;
}

function generateDeviceToken(): string {
  return `pk_dev_${crypto.randomBytes(24).toString("base64url")}`;
}

export function getDeviceConfigPath(): string {
  return DEVICE_CONFIG_PATH;
}

export function getOrCreateDeviceToken(): string {
  if (fs.existsSync(DEVICE_CONFIG_PATH)) {
    const parsed = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH, "utf8")) as Partial<DeviceConfig>;
    if (typeof parsed.deviceToken === "string" && parsed.deviceToken.length > 0) {
      return parsed.deviceToken;
    }
  }

  const deviceToken = generateDeviceToken();
  fs.mkdirSync(path.dirname(DEVICE_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(DEVICE_CONFIG_PATH, JSON.stringify({ deviceToken }, null, 2) + "\n");
  return deviceToken;
}
