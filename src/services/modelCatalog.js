export function applyModelCatalog(settings, source, models) {
  if (settings.provider !== source.provider || settings.baseUrl !== source.baseUrl || settings.apiKey !== source.apiKey) return settings;
  return { ...settings, modelCatalogs: { ...(settings.modelCatalogs || {}), [source.provider]: models } };
}
