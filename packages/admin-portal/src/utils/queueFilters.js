export function filterQueueEntries(entries, { serviceFilter = "All", priorityFilter = "All" } = {}) {
  return entries.filter((entry) =>
    (serviceFilter === "All" || entry.serviceType === serviceFilter) &&
    (priorityFilter === "All" || entry.priorityLevel === priorityFilter)
  );
}
