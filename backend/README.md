# Dev Setup

## Install dependencies

- Setup a python 3.x venv (usually in `.venv`)
- `pip3 install --upgrade pip`
- Install pip-tools `pip3 install pip-tools`
- Update dev requirements: `pip-compile --output-file=requirements.dev.txt requirements.dev.in`
- Update requirements: `pip-compile --output-file=requirements.txt requirements.in`
- Install dev requirements `pip3 install -r requirements.dev.txt`
- Install requirements `pip3 install -r requirements.txt`

## Pycharm Setup

You need to setup the `backend` folder as the source folder:

- Pycharm (file) -> Settings
- Project: iCharm -> Project Structure
- Click on `backend` and then click on `sources`. On the left it should now be listed as a `sources` folder

## VScode Setup (TODO)
