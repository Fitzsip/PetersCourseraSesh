// Optional site-wide settings. A key set here is used for every visitor;
// visitors can also enter their own key under Settings (stored in their browser).
window.EVIE_CONFIG = {
  ocmApiKey: '',

  // Shared "I'm heading here" feature. Leave blank to switch it off.
  // From your Supabase project: Project Settings -> API (or "API Keys").
  // The publishable/anon key is designed to be public; the table's security
  // rules in supabase/schema.sql decide what it can do.
  supabaseUrl: '',
  supabaseKey: '',
};
