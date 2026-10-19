import { useEffect, useState } from "react";
import { getInventory } from "../services/api.js";

export function isInventoryItemUnavailable(item) {
  if (Number(item?.quantity || 0) <= 0) return true;
  if (!item?.expiryDate) return false;
  const expiry = new Date(item.expiryDate);
  if (Number.isNaN(expiry.getTime())) return false;
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

export function inventoryItemLabel(item) {
  const category = item.category || "Other";
  const generic = item.genericName ? ` (${item.genericName})` : "";
  const stock = `${Number(item.quantity) || 0} ${item.unit || "units"} in stock`;
  const availability = isInventoryItemUnavailable(item)
    ? Number(item.quantity || 0) <= 0 ? "Out of stock" : "Expired"
    : stock;
  return `${item.name}${generic} — ${category} · ${availability}`;
}

export default function useMedicineInventory() {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");

  useEffect(() => {
    let active = true;
    getInventory()
      .then((items) => { if (active) setInventoryItems(Array.isArray(items) ? items : []); })
      .catch(() => { if (active) setInventoryError("Could not load inventory items."); })
      .finally(() => { if (active) setInventoryLoading(false); });
    return () => { active = false; };
  }, []);

  return { inventoryItems, inventoryLoading, inventoryError };
}
