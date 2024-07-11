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


    // await page.getByRole('link', { name: '进入课程' }).click();
    // await page.getByRole('row', { name: '专业课-质量员（市政方向） （必学课） 道路工程新设备（一） 李英杰 0% 未完成 开始听课' }).getByRole('link').click();
    // const page2 = await page.waitForEvent('popup');

    // await page2.waitForSelector(`.lists`, { timeout: 5000 });
    // const xxElements = await page2.$$(`.lists`);
    // for (const element of xxElements) {
    //     const liElements = await element.$$('li');
    //     for (const liElement of liElements) {
    //         await liElement.click();
    //     }
    // }


    let parentElement = null;
    let startSKStatus = false;
    let checkTargetStatus = false;
    let checkTarget = setInterval(async () => {
        try {
            if (checkTargetStatus) return;
            checkTargetStatus = true;


            const startSelector = '#tbodyGrid';

            await page.waitForSelector(startSelector, { timeout: 5000 });

            parentElement = await page.$(startSelector);


            if (!parentElement) {
                checkTargetStatus = false;
                return;
            }
            startSKStatus = true;
            clearInterval(checkTarget);
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



    let directoryPage = null;
    // 0页面为创建，1页面已创建，2页面检查已启动
    let directoryPageStatus = 0;
    let videoPage = null;
    let videoPageStatus = 0;
    let startSK = setInterval(async () => {
        try {
            if (!startSKStatus || directoryPageStatus != 0 || videoPageStatus != 0) return;
            startSKStatus = false;
            const allChildElements = await parentElement.$$('tr');
            for (let child of allChildElements) {
                // topHed data
                const studyid = await child.getAttribute('studyid');
                if (!studyid) continue;
                const jdElements = await child.$$(`.${"w85"}`);
                if (!jdElements) continue;
                let status = false;
                let targetContentText = "";
                for (let jdElementsItem of jdElements) {
                    let textContent = await jdElementsItem.innerText();
                    if (textContent.endsWith("未完成")) {
                        if (textContent.startsWith("0%")) {
                            targetContentText = "开始听课"
                        } else {
                            targetContentText = "继续听课"
                        }
                        status = true;
                        break;
                    }
                }
                if (!status) continue;
                targetContentText = "开始听课"

                const btnElements = await child.$$(`.${"w100"}`);
                if (!btnElements) continue;

                const links = [];

                // 遍历每个元素
                for (const element of btnElements) {
                    // 获取当前元素下的所有a标签
                    const aTags = await element.$$('a');
                    links.push(...aTags);

                    // 检查是否有子元素，如果有则递归查找
                    const childElements = await element.$$('*');
                    for (const childElement of childElements) {
                        const childLinks = await getAllALinks(childElement, '*');
                        links.push(...childLinks);
                    }
                }

                for (let linksItem of links) {
                    let textContent = await linksItem.innerText();
                    if (targetContentText != textContent) continue;
                    await linksItem.click();

                    if (targetContentText = "继续听课") {
                        videoPage = await page.waitForEvent('popup');
                        directoryPageStatus = 0;
                        videoPageStatus = 1;
                    } else {
                        directoryPage = await page.waitForEvent('popup');
                        videoPageStatus = 0;
                        directoryPageStatus = 1;
                    }
                    startSKStatus = true;
                    return;
                }
            }

            clearInterval(startSK);
        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时`);
            } else {
                logger.error(`元素未找到或页面加载超时:${error}`);
            }
            startSKStatus = true;
            return;
        }
    }, 2000)


    let directoryListening = setInterval(async () => {
        try {
            if (directoryPageStatus != 1) return;
            directoryPageStatus = 2;


            const startSelector = '.ccb_cons';

            await directoryPage.waitForSelector(startSelector, { timeout: 5000 });

            let targetElement = await directoryPage.$(startSelector);
            const childLinks = await getAllLILinks(targetElement, '*');
            if (childLinks.length < 1) {
                directoryPageStatus = 0;
                return;
            }
            await childLinks[0].click();
            videoPage = await directoryPage.waitForEvent('popup');

            directoryPageStatus = 0;
            videoPageStatus = 1;

        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时`);
            } else {
                logger.error(`元素未找到或页面加载超时:${error}`);
            }
            directoryPage && await directoryPage.close();
            directoryPageStatus = 0;
            return;
        }
    }, 2000)

    let videoListening = setInterval(async () => {
        try {
            if (videoPageStatus != 1) return;
            videoPageStatus = 2;
            const videoElement = await page.$('video');


            const isVideoEnded = await videoPage.evaluate(video => video.ended, videoElement);
            if (isVideoEnded) {
                console.log('Video has ended.');
            }

            const isPaused = await videoPage.evaluate(video => video.paused, videoElement);
            if (isPaused) {
                console.log('Video is paused. Resuming playback.');

                // 在页面上下文中调用video.play()方法来继续播放
                await videoPage.evaluate(video => video.play(), videoElement);
            }




            videoPageStatus = 0;
        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时`);
            } else {
                logger.error(`元素未找到或页面加载超时:${error}`);
            }
            videoPageStatus = 1;
            return;
        }
    }, 2000)
})();


async function getAllALinks(page, selector) {
    const elements = await page.$$(selector);
    const links = [];

    // 遍历每个元素
    for (const element of elements) {
        // 获取当前元素下的所有a标签
        const aTags = await element.$$('a');
        links.push(...aTags);

        // 检查是否有子元素，如果有则递归查找
        const childElements = await element.$$('*');
        for (const childElement of childElements) {
            const childLinks = await getAllALinks(childElement, '*');
            links.push(...childLinks);
        }
    }

    return links;
}

async function getAllLILinks(page, selector) {
    const elements = await page.$$(selector);
    const links = [];

    // 遍历每个元素
    for (const element of elements) {
        // 获取当前元素下的所有a标签
        const aTags = await element.$$('li');
        links.push(...aTags);

        // 检查是否有子元素，如果有则递归查找
        const childElements = await element.$$('*');
        for (const childElement of childElements) {
            const childLinks = await getAllALinks(childElement, '*');
            links.push(...childLinks);
        }
    }

    return links;
}


