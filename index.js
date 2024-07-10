global.$fs = require('fs');
global.$path = require('path');
global.$moment = require('moment');

const { chromium, webkit } = require('playwright');
const winston = require('winston');

const logger = winston.createLogger({
    transports: [
        new winston.transports.File({ filename: 'logs.log' })
    ]
});

let configFile = "./config.json";
let config = $fs.readFileSync($path.join(process.cwd(), configFile), 'utf8');
config = JSON.parse(config);

const browserPath = "./webkit-2035/Playwright.exe";
const pageGotoPath = config.pageGotoPath;


(async () => {
    let browser = null;
    if (process.env.NODE_ENV == "development") {
        browser = await chromium.launch({ headless: false });
    } else {
        browser = await webkit.launch({ executablePath: browserPath, headless: false });
    }

    // 新建一个浏览器上下文
    const context = await browser.newContext();


    const page = await context.newPage({ viewport: { width: 1600, height: 900 } });

    await page.goto(pageGotoPath);
    if (process.env.NODE_ENV == "development") {
        await page.setViewportSize({ width: 1600, height: 900 });
        await page.frameLocator('iframe').getByPlaceholder('请输入姓名').fill('');
        await page.frameLocator('iframe').getByPlaceholder('请输入身份证号').fill('');
    }


    await page.getByRole('link', { name: '进入课程' }).click();
    await page.getByRole('row', { name: '专业课-质量员（市政方向） （必学课） 道路工程新设备（一） 李英杰 0% 未完成 开始听课' }).getByRole('link').click();
    const page2 = await page.waitForEvent('popup');

    await page2.waitForSelector(`.lists`, { timeout: 5000 });
    const xxElements = await page2.$$(`.lists`);
    for (const element of xxElements) {
        const liElements = await element.$$('li');
        for (const liElement of liElements) {
            await liElement.click();
        }
    }


    let parentElement = null;
    let checkTargetStatus = false;
    let checkTarget = setInterval(async () => {
        try {
            if (checkTargetStatus) return;

            checkTargetStatus = true;

            const startSelector = '#submitExam';

            await page.waitForSelector(startSelector, { timeout: 5000 });

            const startElement = await page.$(startSelector);
            const startTextContent = await startElement.inputValue();

            if (startTextContent != "提交答卷") {
                checkTargetStatus = false;
                return;
            }


            const selector = '#set_div_wyks_detail';
            await page.waitForSelector(selector, { timeout: 5000 });

            parentElement = await page.$(selector);


            if (!parentElement) {
                checkTargetStatus = false;
                return;
            }

        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时`);
            } else {
                logger.error(`元素未找到或页面加载超时:${error}`);
            }
            checkTargetStatus = false;
            return;
        }
    }, 2000)

})();

