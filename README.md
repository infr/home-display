<img width="800" alt="home-display" src="https://github.com/user-attachments/assets/bc56c119-a16d-49f6-8c69-045abc7a53a1">

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

