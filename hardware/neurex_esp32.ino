/* Neurex band: ESP32 + MPU6050 accelerometer on the front of the neck.
   Reads the accelerometer 100 times a second, removes slow posture changes,
   and flags swallow-like bursts of movement. Everything is sent over USB.

   Wiring (MPU6050 / GY-521 board):  VCC -> 3V3   GND -> GND   SDA -> GPIO21   SCL -> GPIO22
   Open Tools > Serial Plotter (115200 baud) to watch the signal, or Serial Monitor to read it.
   Output lines:  X:..,Y:..,Z:..,Motion:..   (milli-g, for the plotter)
                  SWALLOW at <ms> ms, peak <mg>   (a swallow-like movement was found)
   Hold still for the first 3 seconds while it learns the quiet level. */
#include <Wire.h>
#include <math.h>

uint8_t MPU = 0x68;
float baseX = 0, baseY = 0, baseZ = 0;
bool calibrated = false;
unsigned long lastSample = 0, startMs = 0, lastSwallow = 0;

// swallow detection
float energy = 0, quietMean = 0, quietM2 = 0, burstPeak = 0;
unsigned long nQuiet = 0;
bool inBurst = false;
const unsigned long CALIBRATE_MS = 3000, REFRACTORY_MS = 1500;

void writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

bool readAcceleration(float &x, float &y, float &z) {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU, 6) != 6) return false;
  // Read the 6 bytes one at a time, in order (FIX: "Wire.read() << 8 | Wire.read()"
  // lets the compiler read them in either order, which scrambles the numbers)
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  int16_t rawX = (int16_t)((b[0] << 8) | b[1]);
  int16_t rawY = (int16_t)((b[2] << 8) | b[3]);
  int16_t rawZ = (int16_t)((b[4] << 8) | b[5]);
  x = rawX / 16.384f;  // milli-g at +/-2g
  y = rawY / 16.384f;
  z = rawZ / 16.384f;
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1500);  // FIX: give the Serial Monitor time to connect, so you see the messages below
  Wire.begin(21, 22);
  Wire.setClock(400000);
  delay(200);

  // Find the sensor at 0x68 or 0x69
  Wire.beginTransmission(0x68);
  if (Wire.endTransmission() != 0) MPU = 0x69;
  Wire.beginTransmission(MPU);
  if (Wire.endTransmission() != 0) {
    // FIX: keep repeating the message (instead of printing it once and freezing silently)
    while (true) { Serial.println("MPU6050 not detected: check VCC->3V3, GND, SDA->21, SCL->22"); delay(1000); }
  }
  Serial.print("MPU6050 found at 0x"); Serial.println(MPU, HEX);

  writeRegister(0x6B, 0x00);  // wake up
  writeRegister(0x1C, 0x00);  // +/-2g, most sensitive
  writeRegister(0x1A, 0x03);  // low-pass filter ~44 Hz
  writeRegister(0x19, 0x04);  // 200 Hz internal sample rate
  delay(100);

  Serial.println("Hold still for 3 seconds...");
  startMs = millis();
}

void loop() {
  if (micros() - lastSample < 10000) return;  // 100 Hz
  lastSample = micros();

  float x, y, z;
  if (!readAcceleration(x, y, z)) { Serial.println("read failed"); delay(100); return; }

  if (!calibrated) { baseX = x; baseY = y; baseZ = z; calibrated = true; }

  // remove slow posture/gravity changes
  float dx = x - baseX, dy = y - baseY, dz = z - baseZ;
  const float alpha = 0.002;
  baseX += alpha * dx; baseY += alpha * dy; baseZ += alpha * dz;
  float motion = sqrt(dx * dx + dy * dy + dz * dz);

  // swallow detection: a short burst of motion well above this person's quiet level
  energy += 0.15f * (motion * motion - energy);
  unsigned long t = millis() - startMs;
  if (t < CALIBRATE_MS) {
    nQuiet++; float d = energy - quietMean; quietMean += d / nQuiet; quietM2 += d * (energy - quietMean);
  } else {
    float sd = sqrt(quietM2 / max(1UL, nQuiet - 1));
    float threshold = quietMean + 6.0f * sd + 25.0f;  // +25 so tiny noise never counts
    if (!inBurst && energy > threshold && millis() - lastSwallow > REFRACTORY_MS) { inBurst = true; burstPeak = energy; }
    if (inBurst) {
      if (energy > burstPeak) burstPeak = energy;
      if (energy < threshold * 0.5f) {
        inBurst = false; lastSwallow = millis();
        Serial.print("SWALLOW at "); Serial.print(t); Serial.print(" ms, peak "); Serial.println(sqrt(burstPeak), 1);
      }
    }
  }

  Serial.print("X:"); Serial.print(dx, 2);
  Serial.print(",Y:"); Serial.print(dy, 2);
  Serial.print(",Z:"); Serial.print(dz, 2);
  Serial.print(",Motion:"); Serial.println(motion, 2);
}
