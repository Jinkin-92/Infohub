# InfoHub

InfoHub is a local subscription hub for Windows users. It aggregates content from platforms like WeChat, Weibo, X, Zhihu, Xiaohongshu, Bilibili, YouTube, and RSS into one local web app.

For friend testing and packaged delivery, the primary user guide is:

- [使用说明.txt](/d:/code/aggregation/infohub/使用说明.txt)

Quick entry points:

- `install.bat`: install dependencies and build the app
- `start.bat`: start backend/frontend and open the local web page
- `stop.bat`: stop InfoHub services
- `update.bat`: refresh dependencies and rebuild
- `package-release.bat`: build a Windows test package

Notes:

- The distributed package is kept within 50MB when possible.
- The package prioritizes bundling stable, small, high-value assets such as the prebuilt frontend/backend output and the portable Node.js runtime when size allows.
- Large and fast-changing dependencies such as browser runtimes and `node_modules` are not bundled.
- Weibo only needs a browser runtime during reconnect/login. Daily collection and manual refresh use the saved cookie over HTTP and no longer open a browser window.
