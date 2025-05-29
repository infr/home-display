# Home automation display

This is part of my home automation system. It runs on a Raspberry Pi with a 7" touchscreen display (800x480). It shows the electricity price, and you can remotely heat up the cars. Currently, BMW works but the Mitsubishi PHEV requires some more work.

---

<img width="800" alt="home-display" src="https://github.com/user-attachments/assets/3f65a19d-eb60-4969-888b-ba053e8d12b6" />


# Blog posts

- [Building a home automation system (part 1)](https://kimsalmi.com/posts/2024/home-automation/)
- [Connecting the cars (part 2)](https://kimsalmi.com/posts/2024/home-automation-2/)  

# Setup

Install [Colin Bendell's BMW package](https://github.com/colinbendell/bmw):

```bash
npm install -g https://github.com/colinbendell/bmw
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
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Run the server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8990
```

