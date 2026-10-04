// מחליף את @supabase/supabase-js במסד הנתונים המדומה (fake-supabase.mjs). נרשם מ-harness.mjs.
const fake = new URL('./fake-supabase.mjs', import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === '@supabase/supabase-js') return { url: fake, shortCircuit: true };
  return next(specifier, context);
}
