import { z } from 'zod'
import { authoringSchema } from './format'

/** The JSON Schema published to R2 at /theme/v1.json — what editors autocomplete against. */
export const themeJsonSchema = () => `${JSON.stringify(z.toJSONSchema(authoringSchema), null, 2)}\n`
