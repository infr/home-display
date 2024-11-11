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

