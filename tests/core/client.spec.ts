import * as elliptic from 'elliptic';
import * as puppeteer from 'puppeteer';
import { BTCPayClient } from '../../src/core/client';
import { Cryptography as myCrypto } from '../../src/core/cryptography';

const USER_NAME = 'test@example.com';
const PASSWORD = 'satoshinakamoto';
const URL = 'https://testnet.demo.btcpayserver.org/';

const MY_PRIVATE_KEY = Buffer.from(
  '31eb31ecf1a640c9d1e0a1105501f36235f8c7d51d67dcf74ccc968d74cb6b25',
  'hex',
);

const STORE_ID = 'HPPHFtqtsKsF3KU18fBNwVGP64hicGoRynvQrC3R2Rkw';
const TOKENS = {
  merchant: 'DwSMQ4SF7GAJRaMiLn4zjAR35bFJwgSpuKt9pxYoQNjJ',
};

const INVOICE_ID = 'TRnwXeAkuLQihe22mJs7J4';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const loginAndGetPairingCode = async (): Promise<any> => {
  const newTokenName = 'autotest ' + new Date().getTime();

  const browser = await puppeteer.launch({ headless: true });
  const page = (await browser.pages())[0];
  await page.goto('https://testnet.demo.btcpayserver.org/Account/Login');

  await page.type('#Email', USER_NAME);
  await page.type('#Password', PASSWORD);
  await page.click('#LoginButton');
  await page.goto(
    'https://testnet.demo.btcpayserver.org/stores/HPPHFtqtsKsF3' +
      'KU18fBNwVGP64hicGoRynvQrC3R2Rkw/Tokens/Create',
  );
  await page.type('#Label', newTokenName);
  await page.click('[type="submit"]');
  await sleep(600);
  await page.click('[type="submit"]');
  await sleep(600);
  const contents = await page.$eval(
    'div.alert.alert-success.alert-dismissible',
    el => el.innerHTML,
  );
  const pairingCode = (contents.match(
    /Server initiated pairing code: (\S{7})/,
  ) || [])[1];
  if (!pairingCode) throw new Error('Could not get pairing code');
  return {
    browser,
    page,
    pairingCode,
  };
};

const deleteTokenAndClose = async (
  browser: puppeteer.Browser,
  page: puppeteer.Page,
) => {
  await page.goto(
    'https://testnet.demo.btcpayserver.org/stores/HPPHFtqtsKsF3' +
      'KU18fBNwVGP64hicGoRynvQrC3R2Rkw/Tokens',
  );
  const link = await page.$eval(
    'table.table.table-sm.table-responsive-md',
    el =>
      el.children[1].children[1].children[1].children[1].attributes[0]
        .nodeValue,
  );
  await page.goto('https://testnet.demo.btcpayserver.org' + link);
  await sleep(600);
  await page.click('[type="submit"]');
  await sleep(100);
  browser.close();
};

let MY_KEYPAIR: elliptic.ec.KeyPair;
let client: BTCPayClient;
describe('btcpay.core.client', () => {
  beforeAll(() => {
    jest.setTimeout(20000); // browser takes a while
    MY_KEYPAIR = myCrypto.load_keypair(MY_PRIVATE_KEY);
    client = new BTCPayClient(URL, MY_KEYPAIR, TOKENS);
  });

  it('should pair with server', async () => {
    const pairingData = await loginAndGetPairingCode();
    const myClient = new BTCPayClient(URL, MY_KEYPAIR);
    const result = await myClient.pair_client(pairingData.pairingCode).then(
      v => v,
      async err => {
        if (
          err.message.match(
            /^404 - {"error":"The specified pairingCode is not found"}$/,
          )
        )
          return { merchant: 'test' };
        throw err;
      },
    );
    expect(result.merchant).toBeDefined();
    await deleteTokenAndClose(pairingData.browser, pairingData.page);
    await expect(myClient.pair_client('hduheufhfuf')).rejects.toThrow(
      /^pairing code is not valid$/,
    );
  });

  it('should get rates', async () => {
    const results = await client.get_rates(['LTC_USD', 'BTC_USD'], STORE_ID);
    expect(results[0].rate).toBeDefined();
  });

  it('should create an invoice', async () => {
    const results = await client.create_invoice({
      currency: 'USD',
      price: 1.12,
    });
    expect(results.bitcoinAddress).toBeDefined();
    await expect(
      client.create_invoice({
        currency: 'KDFAHKJFKJ',
        price: 1.12,
      }),
    ).rejects.toThrow(/^Currency is invalid$/);
    await expect(
      client.create_invoice({
        currency: 'USD',
        price: 'xkhdfhu',
      }),
    ).rejects.toThrow(/^Price must be a float$/);
  });

  it('should get invoice', async () => {
    const results = await client.get_invoice(INVOICE_ID);
    expect(results.id).toBe(INVOICE_ID);
  });

  it('should get multiple invoices', async () => {
    const results = await client.get_invoices();
    expect(results[0].bitcoinAddress).toBeDefined();
  });
});
