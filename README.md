# Home automation display

This is part of my home automation system. It runs on a Raspberry Pi with a 7" touchscreen display. It shows the electricity price, and you can remotely heat up the cars. Currently, BMW works but the Mitsubishi PHEV requires some more work.

---

<img width="800" alt="home-display" src="https://github.com/user-attachments/assets/bc56c119-a16d-49f6-8c69-045abc7a53a1">


# Blog posts

- [Building a home automation system (part 1)](https://kimsalmi.com/posts/2024/home-automation/)
- [Connecting the cars (part 2)](https://kimsalmi.com/posts/2024/home-automation-2/)  

# Setup

Install [Colin Bendell's BMW package](https://github.com/colinbendell/bmw):

```bash
npm install -g https://github.com/colinbendell/bmw`
```

Set your ConnectedDrive credentials to `~/.bmw`:
```bash
[default]
email=email@example.com
password=password
geo=row
```

Install fastapi and uvicorn:

```bash
pip install fastapi uvicorn
```

Run the server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8990
```

