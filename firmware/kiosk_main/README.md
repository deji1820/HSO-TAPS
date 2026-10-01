# Combined kiosk firmware

`kiosk_main.ino` combines the ESP32 functionality from the supplied code: RC522 RFID, MLX90614 temperature, ultrasonic height, the BLE weighing scale, Omron HEM-7140T1 BLE blood pressure, RGB status LEDs, Wi-Fi, and Supabase `kiosk_sessions` requests.

## Local setup

1. Copy `secrets.h.example` to `secrets.h` in this folder.
2. Set the local Wi-Fi credentials and a Supabase key that is safe for device use and restricted by database policies. Do not put a service-role key in firmware or commit `secrets.h`.
3. Install the Arduino libraries used by the sketch: Adafruit MLX90614, MFRC522, and NimBLE-Arduino. The ESP32 Arduino core provides Wi-Fi, HTTPClient, SPI, and Wire.
4. Open `kiosk_main.ino` in Arduino IDE with an ESP32 DevKit board selected.

The firmware sends RFID session inserts and sensor/BP updates directly to the Supabase REST table. The Supabase table and row-level security policies must permit only the required operations and columns.

The separate `rfid_reader`, `thermal_scanner`, and `weight_height` sketches remain as standalone examples; they are not automatically combined with or replaced by this main sketch.
