const KNOWLEDGE_API = "/api/v1/public/knowledge";

let cachedKnowledge = null;
let pendingKnowledge = null;

export const fetchCentralKnowledge = async () => {
  if (cachedKnowledge) return cachedKnowledge;
  if (pendingKnowledge) return pendingKnowledge;

  pendingKnowledge = fetch(KNOWLEDGE_API)
    .then((response) => {
      if (!response.ok) throw new Error("Failed to fetch central intelligence.");
      return response.json();
    })
    .then((payload) => {
      cachedKnowledge = payload || {};
      return cachedKnowledge;
    })
    .finally(() => {
      pendingKnowledge = null;
    });

  return pendingKnowledge;
};
