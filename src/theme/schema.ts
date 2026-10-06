import { z } from 'zod'
import { authoringSchema } from './format'

/** The JSON Schema editors autocomplete against — schemas/theme/v1.json, uploaded by hand to R2 at /theme/v1.json. */
export const themeJsonSchema = () => `${JSON.stringify(z.toJSONSchema(authoringSchema), null, 2)}\n`
