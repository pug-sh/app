import { z } from 'zod'
import { authoringSchema } from './format'

/** The JSON Schema editors autocomplete against: schemas/theme/v1.json, which pug-sh/themes publishes at SCHEMA_URL. */
export const themeJsonSchema = () => `${JSON.stringify(z.toJSONSchema(authoringSchema), null, 2)}\n`
