# Payslip4U Downloader

First, create a file at `~/.payslip4u-downloader.json` with your login credentials:

```json
{
    "url": "https://YOUR_COMPANY.payslip4u.co.uk/Employee/Login/",
    "username": "EMAIL",
    "password": "PASSWORD",
    "saveDir": "/tmp"
}
```

Next, install

```
npm install -g payslip4u-downloader
```

Then, run

```
payslip4u-downloader
```

Look in your `saveDir` and you should see all of your payslips so far downloaded
