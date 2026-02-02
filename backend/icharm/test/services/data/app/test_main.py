import pandas as pd
import unittest

import requests


TEST_URL = "http://localhost:8002/api/v2/"


class TestMain(unittest.TestCase):
    def test_get_all_metadata(self):
        url = TEST_URL + "datasets"
        response = requests.get(url, json={})
        data = response.json()
        assert len(data) == 9
        return

    def test_get_timestamps(self):
        dataset_id = "f304b87d-63d0-4f9a-85ec-c56ecf1096cd"
        url = TEST_URL + "timestamps"
        response = requests.get(
            url,
            json={
                "datasetId": dataset_id,
            },
        )
        data = response.json()
        assert len(data.keys()) == 2
        return

    def test_get_levels(self):
        dataset_id = "f304b87d-63d0-4f9a-85ec-c56ecf1096cd"
        url = TEST_URL + "levels"
        response = requests.get(
            url,
            json={
                "datasetId": dataset_id,
            },
        )
        data = response.json()
        assert len(data.keys()) == 2
        return

    def test_get_gridboxes(self):
        dataset_id = "f304b87d-63d0-4f9a-85ec-c56ecf1096cd"
        url = TEST_URL + "gridboxes"
        response = requests.get(
            url,
            json={
                "datasetId": dataset_id,
            },
        )
        data = response.json()
        assert len(data.keys()) == 5
        return

    def test_get_gridbox_data(self):
        dataset_id = "f304b87d-63d0-4f9a-85ec-c56ecf1096cd"
        url = TEST_URL + "gridbox_data"
        response = requests.get(
            url,
            json={
                "datasetId": dataset_id,
                "timestampId": 1000,
                "levelId": 1,
            },
        )
        data = response.json()
        assert len(data.keys()) == 4
        return

    def test_get_timeseries_data(self):
        dataset_id = "f304b87d-63d0-4f9a-85ec-c56ecf1096cd"
        url = TEST_URL + "timeseries_data"
        response = requests.get(
            url,
            json={
                "datasetId": dataset_id,
                "gridboxId": 1000,
                "levelId": 1,
            },
        )
        data = response.json()
        assert len(data.keys()) == 4
        return

    def test_example(self):
        """
        This is an example test.
        I wanted to make sure my rewrite of a process would give the same value back
        """
        all_series = {
            "1": pd.Series([1, 2, 3]),
            "2": pd.Series([4, 5, 6]),
        }

        common_index_1 = pd.concat(all_series.values(), axis=1).index
        common_index_1 = common_index_1.sort_values()
        common_index_2 = None
        for series in all_series.values():
            if common_index_2 is None:
                common_index_2 = series.index
            else:
                common_index_2 = common_index_2.union(series.index)
        common_index_2 = common_index_2.sort_values()

        assert all(common_index_1 == common_index_2)
        return
