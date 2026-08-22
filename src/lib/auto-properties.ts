import type { JsonObject } from '@bufbuild/protobuf'
import { structFirst, structGet } from './struct'

// The web and native SDKs name the same facts differently, and neither key is derivable from the
// other, so every surface that reads a device off an event goes through here rather than picking one
// vocabulary and silently blanking the other's visitors.

// Web sends $device (a UA-CH model, Chromium only), Flutter $deviceModel. $deviceManufacturer is
// deliberately left out: Apple's models are marketing names that already identify it, so prefixing
// produced "Apple iPhone 15 Pro" — and the overview's Devices panel ranks $deviceModel alone.
export const deviceModelOf = (auto: JsonObject | undefined) => structFirst(auto, ['$device', '$deviceModel'])

// Every SDK sends $platform because it isn't derivable from the UA header; it survives to the client
// because ingest promotes it to a column and the read path merges it back.
export const platformOf = (auto: JsonObject | undefined) => structGet(auto, '$platform')
