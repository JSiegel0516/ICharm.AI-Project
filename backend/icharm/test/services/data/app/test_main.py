import pandas as pd
import unittest


class TestMain(unittest.TestCase):
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
