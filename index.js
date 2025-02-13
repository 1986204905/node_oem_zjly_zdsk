global.$fs = require('fs');
global.$path = require('path');
global.$moment = require('moment');
const { chromium, firefox } = require('playwright');
const winston = require('winston');

const logger = winston.createLogger({
    transports: [
        new winston.transports.File({ filename: 'logs.log' })
    ]
});

let configFile = "./config.json";
let config = $fs.readFileSync($path.join(process.cwd(), configFile), 'utf8');
config = JSON.parse(config);

const browserPath = "./firefox-1454/firefox/firefox.exe";
const pageGotoPath = config.pageGotoPath;



(async () => {
    let browser = null;
    browser = await firefox.launch({ executablePath: browserPath, headless: false, permissions: ['camera'] });

    const context = await browser.newContext();

    // await context.grantPermissions(['camera']);



    const page = await context.newPage({ viewport: { width: 1600, height: 900 } });

    await page.goto(pageGotoPath);
    await page.setViewportSize({ width: 1600, height: 900 });



    if (process.env.NODE_ENV == "development") {
        await page.frameLocator('iframe').getByPlaceholder('请输入姓名').fill('');
        await page.frameLocator('iframe').getByPlaceholder('请输入身份证号').fill('');
    }

    // await page.getByRole('link', { name: '进入课程' }).click();

    let parentElement = null;
    let checkTargetStatus = false;

    let startStatus = false;

    let checkTarget = setInterval(async () => {
        try {
            if (checkTargetStatus) return;
            checkTargetStatus = true;

            const pages = context.pages();

            if (pages.length != 1) {
                startStatus = false;
                checkTargetStatus = false;
                return;
            }

            const startSelector = '#tbodyGrid';

            await page.waitForSelector(startSelector, { timeout: 5000 });

            parentElement = await page.$(startSelector);


            if (!parentElement) {
                startStatus = false;
                checkTargetStatus = false;
                return;
            }
            startStatus = true;
            checkTargetStatus = false;

            // clearInterval(checkTarget);
        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时1`);
            } else {
                logger.error(`元素未找到或页面加载超时1:${error}`);
            }
            checkTargetStatus = false;
            return;
        }
    }, 2000)



    let directoryPage = null;
    let directoryPageStatus = 0;
    let videoPage = null;
    let videoPageStatus = 0;
    let verifyListeningStastus = 0;

    let startSKStatus = false;

    let startSK = setInterval(async () => {
        try {
            if (startStatus == false || startStatus == true && startSKStatus == true) return;


            startStatus = false;
            startSKStatus = true;

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

                const btnElements = await child.$$(`.${"w100"}`);
                if (!btnElements) continue;

                const links = [];

                for (const element of btnElements) {
                    const aTags = await element.$$('a');
                    links.push(...aTags);

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

                    if (targetContentText == "继续听课") {
                        videoPage = await page.waitForEvent('popup');
                        directoryPageStatus = 0;
                        videoPageStatus = 1;
                        verifyListeningStastus = 1;
                    } else {
                        directoryPage = await page.waitForEvent('popup');
                        videoPageStatus = 0;
                        directoryPageStatus = 1;
                    }
                    startSKStatus = false;
                    startStatus = false;

                    return;
                }
            }

            // clearInterval(startSK);
            startStatus = false;
        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时2`);
            } else {
                logger.error(`元素未找到或页面加载超时2:${error}`);
            }
            startStatus = true;
            startSKStatus = false;
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
            verifyListeningStastus = 1;
            await directoryPage.close();

        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时3`);
            } else {
                logger.error(`元素未找到或页面加载超时3:${error}`);
            }
            directoryPage && await directoryPage.close();
            directoryPageStatus = 0;
            return;
        }
    }, 5000)

    let videoListening = setInterval(async () => {
        try {
            if (videoPageStatus != 1) return;
            videoPageStatus = 2;

            const jxElement = await videoPage.getByRole('button', { name: '继续学习' });
            if (jxElement) {
                const jxElementVisible = await jxElement.isVisible();
                if (jxElementVisible) {
                    videoPageStatus = 1;
                    return;
                }
            }


            const videoElement = await videoPage.$('video');

            // const isVideoEnded = await videoPage.evaluate(video => video.ended, videoElement);
            // if (isVideoEnded) {
            //     console.log('Video has ended.');
            // }

            const isPaused = await videoPage.evaluate(video => video.paused, videoElement);

            if (isPaused) {
                console.log('Video is paused. Resuming playback.');
                await videoPage.evaluate(video => video.play(), videoElement);
            }




            videoPageStatus = 1;
        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时4`);
            } else {
                logger.error(`元素未找到或页面加载超时4:${error}`);
            }
            videoPageStatus = 1;
            return;
        }
    }, 5000)

    let verifyListening = setInterval(async () => {
        try {
            if (verifyListeningStastus != 1) return;
            verifyListeningStastus = 2;
            let startSelector = `#jbox-states`;
            await videoPage.waitForSelector(startSelector, { timeout: 5000 });

            // 等待iframe加载完成
            await videoPage.waitForSelector('iframe[name="jbox-iframe"]', { state: 'attached' });

            const startElement = await videoPage.frameLocator('iframe[name="jbox-iframe"]').getByRole('button', { name: '开始验证' });


            // const endElement = await videoPage.frameLocator('iframe[name="jbox-iframe"]').getByText('采集完成')
            const endElement = await videoPage.frameLocator('iframe[name="jbox-iframe"]').locator('#successDiv div')

            // successDiv
            const jxElement = await videoPage.getByRole('button', { name: '继续学习' });
            if (startElement) {
                const startElementVisible = await startElement.isVisible();
                if (startElementVisible) {
                    await startElement.click();
                } else {
                    if (endElement && jxElement) {
                        const endElementVisible = await endElement.isVisible();
                        const jxElementVisible = await jxElement.isVisible();
                        if (endElementVisible && jxElementVisible) {
                            await jxElement.click();

                        }
                    }

                }
            }

            verifyListeningStastus = 1;
        } catch (error) {
            if (error && error.name && error.name == "TimeoutError") {
                logger.info(`元素未找到或页面加载超时5`);
            } else {
                logger.error(`元素未找到或页面加载超时5:${error}`);
            }
            verifyListeningStastus = 1;
            return;
        }
    }, 5000)
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


