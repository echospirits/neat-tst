import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  parseOhlqAnnualSalesByWholesaleCsv,
  parseOhlqAnnualSalesCsv,
  syncOhlqAnnualSalesByWholesalePurchaseStateCsv,
} from '../lib/ohlqAnnualSalesImport';

const csv = [
  'District,Agency_Id,Agency_Name,Vendor,Brand,Name,Category,Retail_Bottles_Sold,Retail_Amount,Retail_Tax,Wholesale_Bottles_Sold,Wholesale_Amount,Wholesale_Tax',
  'GPT,10100,JUNGLE JIMS,000000932,0026D,OLD THOMPSON AMERICAN WHISKEY,American Whiskey,1,14.00,0.95,0,0.00,0.00',
  'GPT,10100,JUNGLE JIMS,000000932,0026D,OLD THOMPSON AMERICAN WHISKEY,American Whiskey,2,28.00,1.90,0,0.00,0.00',
].join('\n');

describe('parseOhlqAnnualSalesCsv', () => {
  it('normalizes rows and deduplicates by report date, agency, vendor, and brand', () => {
    const result = parseOhlqAnnualSalesCsv(csv, '2026-05-11');

    assert.equal(result.rows.length, 1);
    assert.equal(result.skippedRows, 0);
    assert.equal(result.rows[0].agencyId, '10100');
    assert.equal(result.rows[0].brand, '0026D');
    assert.equal(result.rows[0].retailBottlesSold, 2);
    assert.equal(result.rows[0].wholesaleBottlesSold, 0);
    assert.equal(new Date(result.rows[0].reportDate).toISOString(), '2026-05-11T00:00:00.000Z');
    assert.equal('id' in result.rows[0], false);
    assert.equal('createdAt' in result.rows[0], false);
    assert.equal('updatedAt' in result.rows[0], false);
    assert.equal('retailAmount' in result.rows[0], false);
    assert.equal('agencyName' in result.rows[0], false);
  });

  it('fails loudly when required headers are missing', () => {
    assert.throws(
      () => parseOhlqAnnualSalesCsv('District,Agency_Id\nGPT,10100', '2026-05-11'),
      /missing required header/i,
    );
  });
});

const wholesaleCsv = [
  '﻿District,Agency_Id,Agency_Name,DimVendor_VendorNumber_,Brand,Name,Category,Permit_Number,Wholesaler,Doing_Business_As,Wholesale_Bottles_Sold,Wholesale_Amount,Wholesale_Tax',
  'GPT,10113,CENTERVILLE LIQUOR & WINE,000000090,0281L,JAMESON,Irish,00072045-1,ADRIENNES WHITE RABBIT INC,ADRIENNES WHITE RABBIT LOUNGE,2,67.68,0.00',
].join('\n');

describe('parseOhlqAnnualSalesByWholesaleCsv', () => {
  it('normalizes wholesale rows with report date and permit details', () => {
    const result = parseOhlqAnnualSalesByWholesaleCsv(wholesaleCsv, '2026-05-11');

    assert.equal(result.rows.length, 1);
    assert.equal(result.skippedRows, 0);
    assert.equal(result.rows[0].agencyId, '10113');
    assert.equal(result.rows[0].vendor, '000000090');
    assert.equal(result.rows[0].permitNumber, '00072045-1');
    assert.equal(result.rows[0].wholesaleBottlesSold, 2);
    assert.equal(new Date(result.rows[0].reportDate).toISOString(), '2026-05-11T00:00:00.000Z');
    assert.equal('id' in result.rows[0], false);
    assert.equal('createdAt' in result.rows[0], false);
    assert.equal('updatedAt' in result.rows[0], false);
    assert.equal('wholesaler' in result.rows[0], false);
    assert.equal('doingBusinessAs' in result.rows[0], false);
  });
});

const echoWholesaleCsv = [
  'District,Agency_Id,Agency_Name,DimVendor_VendorNumber_,Brand,Name,Category,Permit_Number,Wholesaler,Doing_Business_As,Wholesale_Bottles_Sold,Wholesale_Amount,Wholesale_Tax',
  'GPT,10113,CENTERVILLE LIQUOR & WINE,Z90399001,2804B,ECHO SPIRITS DISTILLING CO BOURBON WHISKEY,Bourbon,00072045-1,ADRIENNES WHITE RABBIT INC,ADRIENNES WHITE RABBIT LOUNGE,2,67.68,0.00',
].join('\n');

describe('syncOhlqAnnualSalesByWholesalePurchaseStateCsv', () => {
  it('updates Echo purchase state without importing raw wholesale rows', async () => {
    const updates: unknown[] = [];
    const db = {
      account: {
        findMany: async () => [],
      },
      ohlqBrandMasterItem: {
        findMany: async () => [{ itemCode: '2804B', name: 'Echo Bourbon' }],
      },
      wholesaleAccount: {
        findMany: async () => [
          {
            address: '123 N Main St',
            city: 'Columbus',
            id: 'wholesale-1',
            licenseeId: '72045',
            licenseeIds: [],
            name: 'Adriennes White Rabbit',
            officialAccountId: null,
            state: 'OH',
            zip: '43215',
          },
        ],
        updateMany: async ({ data }: { data: unknown }) => {
          updates.push(data);
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;

    const result = await syncOhlqAnnualSalesByWholesalePurchaseStateCsv({
      csv: echoWholesaleCsv,
      db,
      reportDate: '2026-05-11',
    });

    assert.equal(result.parsedRows, 1);
    assert.equal(result.skippedRows, 0);
    assert.equal(result.echoPurchaseState.updatedAccounts, 1);
    assert.equal(result.echoPurchaseState.matchedPermitNumbers, 1);
    assert.equal(updates.length, 1);

    const update = updates[0] as {
      ohlqLastEchoPurchaseDate: Date;
      ohlqLastEchoPurchaseItemCode: string;
      ohlqLastEchoPurchaseItemName: string;
    };
    assert.equal(update.ohlqLastEchoPurchaseDate.toISOString(), '2026-05-11T00:00:00.000Z');
    assert.equal(update.ohlqLastEchoPurchaseItemCode, '2804B');
    assert.equal(update.ohlqLastEchoPurchaseItemName, 'Echo Bourbon');
  });
});
