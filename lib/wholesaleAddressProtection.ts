export type WholesaleAddressValues = {
  address: string | null;
  city: string | null;
  zip: string | null;
};

export type WholesaleAddressProtection = {
  addressImportProtected?: boolean;
  cityImportProtected?: boolean;
  zipImportProtected?: boolean;
};

// Protection follows the individual field, including an intentional clearing.
// Saving an unrelated field does not stop the other OHLQ fields from refreshing.
export function getWholesaleAddressProtectionForEdit(
  existing: (WholesaleAddressValues & WholesaleAddressProtection) | null | undefined,
  submitted: WholesaleAddressValues,
) {
  return {
    addressImportProtected: existing?.addressImportProtected || (existing?.address ?? null) !== submitted.address ? true : undefined,
    cityImportProtected: existing?.cityImportProtected || (existing?.city ?? null) !== submitted.city ? true : undefined,
    zipImportProtected: existing?.zipImportProtected || (existing?.zip ?? null) !== submitted.zip ? true : undefined,
  };
}

export function getWholesaleAddressValuesForImport(
  current: WholesaleAddressValues & WholesaleAddressProtection,
  source: WholesaleAddressValues,
): WholesaleAddressValues {
  return {
    address: current.addressImportProtected ? current.address : source.address ?? current.address,
    city: current.cityImportProtected ? current.city : source.city ?? current.city,
    zip: current.zipImportProtected ? current.zip : source.zip ?? current.zip,
  };
}

export function getWholesaleAddressValuesForMerge(
  source: WholesaleAddressValues & WholesaleAddressProtection,
  destination: WholesaleAddressValues & WholesaleAddressProtection,
) {
  const choose = (field: keyof WholesaleAddressValues, flag: keyof WholesaleAddressProtection) =>
    destination[flag] ? destination[field] : source[flag] ? source[field] : destination[field]?.trim() ? destination[field] : source[field];
  return {
    address: choose('address', 'addressImportProtected'),
    city: choose('city', 'cityImportProtected'),
    zip: choose('zip', 'zipImportProtected'),
    ...(destination.addressImportProtected || source.addressImportProtected ? { addressImportProtected: true } : {}),
    ...(destination.cityImportProtected || source.cityImportProtected ? { cityImportProtected: true } : {}),
    ...(destination.zipImportProtected || source.zipImportProtected ? { zipImportProtected: true } : {}),
  };
}
