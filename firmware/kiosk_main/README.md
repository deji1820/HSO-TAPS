# Combined kiosk firmware

`kiosk_main.ino` combines the ESP32 functionality from the supplied code: RC522 RFID, MLX90614 temperature, ultrasonic height, the BLE weighing scale, Omron HEM-7140T1 BLE blood pressure, RGB status LEDs, Wi-Fi, and Supabase `kiosk_sessions` requests.

## Local setup

1. Copy `secrets.h.example` to `secrets.h` in this folder.
2. Set the local Wi-Fi credentials and a Supabase key that is safe for device use and restricted by database policies. Do not put a service-role key in firmware or commit `secrets.h`.
3. Install the Arduino libraries used by the sketch: Adafruit MLX90614, MFRC522, and NimBLE-Arduino. The ESP32 Arduino core provides Wi-Fi, HTTPClient, SPI, and Wire.
4. Open `kiosk_main.ino` in Arduino IDE with an ESP32 DevKit board selected.

The firmware sends RFID session inserts and sensor/BP updates directly to the Supabase REST table. The Supabase table and row-level security policies must permit only the required operations and columns.

At startup, the firmware reads the newest kiosk-session ID and ignores pending requests that were already present. During operation, it only polls for pending IDs newer than the last request it handled, so abandoned requests cannot be picked up after a newer screening finishes. If a request was already pending when the ESP32 boots, start a fresh scan from the kiosk. Omron retries create a fresh NimBLE client and repeat service discovery once if the first discovery is empty. It continues retrying for up to 160 seconds while the same request remains pending, then stops; the kiosk marks timed-out requests cancelled.

After changing `kiosk_main.ino`, upload it to the ESP32 from Arduino IDE. A Vercel deployment updates the kiosk web app but does not flash firmware to the ESP32.

The separate `rfid_reader`, `thermal_scanner`, and `weight_height` sketches remain as standalone examples; they are not automatically combined with or replaced by this main sketch.
